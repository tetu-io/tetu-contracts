// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

import "../../governance/ControllableV2.sol";
import "../../../openzeppelin/SafeERC20.sol";
import "../../../third_party/IDelegation.sol";
import "../../../third_party/balancer/IFeeDistributor.sol";
import "./IBalLocker.sol";
import "../../../third_party/curve/IGauge.sol";
import "../../../third_party/curve/IGaugeController.sol";


/// @title Dedicated contract for staking and managing veBAL
/// @author belbix
contract BalLocker is ControllableV2, IBalLocker {
  using SafeERC20 for IERC20;

  address public constant override VE_BAL = 0xC128a9954e6c874eA3d62ce62B468bA073093F25;
  address public constant override VE_BAL_UNDERLYING = 0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56;
  uint256 private constant _MAX_LOCK = 365 * 86400;
  uint256 private constant _WEEK = 7 * 86400;

  address public override gaugeController;
  address public override feeDistributor;
  address public override operator;
  mapping(address => address) gaugesToDepositors;

  event ChangeOperator(address oldValue, address newValue);
  event ChangeGaugeController(address oldValue, address newValue);
  event ChangeFeeDistributor(address oldValue, address newValue);
  event LinkGaugeToDistributor(address gauge, address depositor);

  constructor(
    address controller_,
    address operator_,
    address gaugeController_,
    address feeDistributor_
  ) {
    require(controller_ != address(0), "Zero controller");
    require(operator_ != address(0), "Zero operator");
    require(gaugeController_ != address(0), "Zero gaugeController");
    require(feeDistributor_ != address(0), "Zero feeDistributor");

    ControllableV2.initializeControllable(controller_);
    operator = operator_;
    gaugeController = gaugeController_;
    feeDistributor = feeDistributor_;

    IERC20(VE_BAL_UNDERLYING).safeApprove(VE_BAL, type(uint).max);
  }

  modifier onlyGovernance() {
    require(_isGovernance(msg.sender), "Not gov");
    _;
  }

  modifier onlyAllowedDepositor(address gauge) {
    require(gaugesToDepositors[gauge] == msg.sender, "Not allowed");
    _;
  }

  //*****************************************************************
  //********************* SNAPSHOT **********************************
  //*****************************************************************

  /// @dev Snapshot voting delegation. ID assumed to be a snapshot space name ex. name.eth
  function delegateVotes(
    bytes32 _id,
    address _delegateContract,
    address _delegate
  ) external override onlyGovernance {
    IDelegation(_delegateContract).setDelegate(_id, _delegate);
  }

  /// @dev Clear snapshot voting delegation. ID assumed to be a snapshot space name ex. name.eth
  function clearDelegatedVotes(
    bytes32 _id,
    address _delegateContract
  ) external override onlyGovernance {
    IDelegation(_delegateContract).clearDelegate(_id);
  }

  //*****************************************************************
  //********************* veBAL ACTIONS *****************************
  //*****************************************************************

  /// @dev Stake BAL-ETH LP to the veBAL with max lock. Extend period if necessary.
  ///      Without permissions - anyone can deposit.
  function depositVe(uint256 amount) external override {
    if (amount > 0) {
      // lock on max period
      IVotingEscrow ve = IVotingEscrow(VE_BAL);

      (uint balanceLocked, uint unlockTime) = ve.locked(address(this));
      if (unlockTime == 0 && balanceLocked == 0) {
        ve.create_lock(amount, block.timestamp + _MAX_LOCK);
      } else {
        ve.increase_amount(amount);

        uint256 unlockAt = block.timestamp + _MAX_LOCK;
        uint256 unlockInWeeks = (unlockAt / _WEEK) * _WEEK;

        //increase time too if over 2 week buffer
        if (unlockInWeeks > unlockTime && unlockInWeeks - unlockTime > 2) {
          ve.increase_unlock_time(unlockAt);
        }
      }
      IFeeDistributor(feeDistributor).checkpointUser(address(this));
    }
  }

  /// @dev Claim rewards and send to recipient.
  ///      Only operator can call it.
  ///      Assume that claimed rewards will be immediately transfer to Polygon.
  function claimVeRewards(IERC20[] memory tokens, address recipient) external override {
    require(msg.sender == operator, "Not operator");

    IFeeDistributor(feeDistributor).claimTokens(address(this), tokens);

    // transfer all rewards to operator
    for (uint i; i < tokens.length; ++i) {
      IERC20 token = tokens[i];
      uint balance = token.balanceOf(address(this));
      if (balance != 0) {
        token.safeTransfer(recipient, balance);
      }
    }
  }

  /// @notice Return underlying balance under control.
  function investedUnderlyingBalance() external override view returns (uint) {
    (uint amount,) = IVotingEscrow(VE_BAL).locked(address(this));
    return amount;
  }

  //*****************************************************************
  //********************* GAUGES ACTIONS ****************************
  //*****************************************************************

  /// @dev Deposit to given gauge LP token. Sender should be linked to the gauge.
  function depositToGauge(address gauge, uint amount) external override onlyAllowedDepositor(gauge) {
    address underlying = IGauge(gauge).lp_token();
    IERC20(underlying).safeTransferFrom(msg.sender, address(this), amount);
    IERC20(underlying).safeApprove(gauge, 0);
    IERC20(underlying).safeApprove(gauge, amount);
    IGauge(gauge).deposit(amount);
  }

  /// @dev Withdraw from given gauge LP tokens. Sender should be linked to the gauge.
  function withdrawFromGauge(address gauge, uint amount) external override onlyAllowedDepositor(gauge) {
    IGauge(gauge).withdraw(amount, false);
    address underlying = IGauge(gauge).lp_token();
    IERC20(underlying).safeTransfer(msg.sender, amount);
  }

  /// @dev Claim rewards from given gauge. Sender should be linked to the gauge.
  function claimRewardsFromGauge(address gauge, address receiver) external override onlyAllowedDepositor(gauge) {
    IGauge(gauge).claim_rewards(address(this), receiver);
  }

  //*****************************************************************
  //********************* veBAL VOTING ******************************
  //*****************************************************************

  /// @notice Allocate voting power for changing pool weights
  /// @param _gauges Gauges which _users votes for
  /// @param _userWeights Weights for gauges in bps (units of 0.01%). Minimal is 0.01%. Ignored if 0
  function voteForManyGaugeWeights(
    address[] memory _gauges,
    uint[] memory _userWeights
  ) external onlyGovernance {
    require(_gauges.length == _userWeights.length, "Wrong input");
    IGaugeController(gaugeController).vote_for_many_gauge_weights(_gauges, _userWeights);
  }

  //*****************************************************************
  //********************* GOV ACTIONS *******************************
  //*****************************************************************

  /// @dev Set a new operator address.
  function setOperator(address operator_) external onlyGovernance {
    require(operator_ != address(0), "Zero operator");
    emit ChangeOperator(operator, operator_);
    operator = operator_;
  }

  /// @dev Set a new gauge controller address.
  function setGaugeController(address value) external onlyGovernance {
    require(value != address(0), "Zero value");
    emit ChangeGaugeController(gaugeController, value);
    gaugeController = value;
  }

  /// @dev Set a new operator address.
  function setFeeDistributor(address value) external onlyGovernance {
    require(value != address(0), "Zero value");
    emit ChangeFeeDistributor(feeDistributor, value);
    feeDistributor = value;
  }

  /// @dev Link an address to a gauge.
  ///      Governance can link a depositor only for not linked gauges.
  function linkDepositorsToGauges(
    address[] memory depositors,
    address[] memory gauges
  ) external onlyGovernance {
    for (uint i; i < depositors.length; i++) {
      address depositor = depositors[i];
      address gauge = gauges[i];
      require(gaugesToDepositors[gauge] == address(0), "Gauge already linked");
      gaugesToDepositors[gauge] = depositor;
      emit LinkGaugeToDistributor(gauge, depositor);
    }
  }

  /// @dev Transfer control under a gauge to another address.
  ///      Should have strict control and time-lock in the implementation.
  function changeDepositorToGaugeLink(address gauge, address newDepositor) external {
    address depositor = gaugesToDepositors[gauge];
    require(depositor == msg.sender, "Not depositor");
    gaugesToDepositors[gauge] = newDepositor;
  }
}
