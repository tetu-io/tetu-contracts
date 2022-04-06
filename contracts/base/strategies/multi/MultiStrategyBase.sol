/*
// SPDX-License-Identifier: ISC
*/
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*//*


pragma solidity 0.8.4;

import "./../../../openzeppelin/SafeERC20.sol";
import "./../../../third_party/IERC20Extended.sol";
import "./../ProxyStrategyBase.sol";
import "./pipelines/LinearPipeline.sol";
import "../../SlotsLib.sol";
import "../../interface/strategies/IMaiStablecoinPipe.sol";
import "../../interface/strategies/IAaveMaiBalStrategyBase.sol";

/// @title Multi Strategy Base
/// @author bogdoslav
// TO IMultiStrategyBase
contract MultiStrategyBase is ProxyStrategyBase, LinearPipeline*/
/*, IMultiStrategyBase*//*
 {
  using SafeERC20 for IERC20;
  using SlotsLib for uint;

  uint256 private constant _BUY_BACK_RATIO = 10_00;
  uint256 private constant _TIME_LOCK = 48 hours;

  uint internal constant _TOTAL_AMOUNT_OUT_SLOT    = uint(keccak256("eip1967.AaveMaiBalStrategyBase.totalAmountOut")) - 1;
  uint internal constant _ASSET_SLOT               = uint(keccak256("eip1967.AaveMaiBalStrategyBase._asset")) - 1;
  uint internal constant _TIMELOCKS                = uint(keccak256("eip1967.AaveMaiBalStrategyBase.timelocks")) - 1;
  uint internal constant _TIMELOCK_ADDRESSES       = uint(keccak256("eip1967.AaveMaiBalStrategyBase.timelockAddresses")) - 1;

  event SalvagedFromPipeline(address recipient, address token);
  event SetTargetPercentage(uint256 _targetPercentage);
  event SetMaxImbalance(uint256 _maxImbalance);
  event PipeReplaceAnnounced(uint pipeIndex, address newPipe);

  /// @notice Contract initializer
  function initializeMultiStrategyBase(
    address _controller,
    address _underlyingToken,
    address _vault,
    address[] memory __rewardTokens
  ) public initializer
  {
    require(_controller != address(0), "Zero controller");
    require(_underlyingToken != address(0), "Zero underlying");
    require(_vault != address(0), "Zero vault");

    initializeStrategyBase(_controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO);
    initializeLinearPipeline(_underlyingToken);

    _ASSET_SLOT.set(_underlyingToken);
  }

  /*/
/************************ CHECK FUNCTIONS / MODIFIERS **************************

  /// @dev Only for Governance/Controller.
  function _onlyControllerOrGovernance() internal view {
    require(msg.sender == address(_controller())
      || IController(_controller()).governance() == msg.sender,
      "AMB: Not Gov or Controller");
  }

  function _updateTotalAmount() internal {
    _TOTAL_AMOUNT_OUT_SLOT.set(_getTotalAmountOut());
  }

  // ************* SLOT SETTERS/GETTERS *******************

  /// @dev Returns cached total amount out (in underlying units)
  function totalAmountOut() external view override returns (uint) {
    return _totalAmountOut();
  }

  /// @dev Returns cached total amount out from slot (in underlying units)
  function _totalAmountOut() internal view returns (uint) {
    return _TOTAL_AMOUNT_OUT_SLOT.getUint();
  }

  // ********************************************************

  /// @dev Returns reward pool balance
  function _rewardPoolBalance() internal override view returns (uint256 bal) {
    return _totalAmountOut();
  }

  /// @dev HardWork function for Strategy Base implementation
  function doHardWork()
  external override onlyNotPausedInvesting hardWorkers {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance > 0) {
      _pumpIn(balance);
    }
    _rebalanceAllPipes();
    _claimFromAllPipes();
    uint claimedUnderlying = IERC20(_underlying()).balanceOf(address(this));
    autocompound();
    uint acAndClaimedUnderlying = IERC20(_underlying()).balanceOf(address(this));
    uint toSupply = acAndClaimedUnderlying - claimedUnderlying;
    if (toSupply > 0) {
      _pumpIn(toSupply);
    }
    liquidateRewardDefault();
    _updateTotalAmount();
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 underlyingAmount) internal override {
    _pumpIn(underlyingAmount);
    _updateTotalAmount();
  }

  /// @dev Function to withdraw from pool
  function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override {
    // don't claim on withdraw
    // update cached _totalAmount, and recalculate amount
    uint256 newTotalAmount = _getTotalAmountOut();
    uint256 amount = underlyingAmount * newTotalAmount / _totalAmountOut();
    _pumpOutSource(amount, 0);
    _updateTotalAmount();
  }

  /// @dev Emergency withdraws all most underlying from the pool
  function emergencyWithdrawFromPool() internal override {
    _pumpOut(_getMostUnderlyingBalance(), 0);
    _updateTotalAmount();
  }

  /// @dev Liquidate all reward tokens
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// ********************** EXTERNAL VIEWS **********************

  /// @dev Returns how much tokens are ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Returns underlying pool total amount
  /// @dev Only for statistic
  function poolTotalAmount() external pure override returns (uint256) {
    // We may use few pools in the pipeline.
    // If you know what pool total amount you need for statistic purposes, you can override it in strategy implementation
    return 1;
    // for tests it now stubbed to 1
  }

  /// @dev Returns assets array
  function assets() external view override returns (address[] memory) {
    address[] memory array = new address[](1);
    array[0] = _ASSET_SLOT.getAddress();
    return array;
  }

  /// @dev Returns platform index
  function platform() external pure override returns (Platform) {
    return Platform.AAVE_MAI_BAL;
  }

  // ***************************************
  // ************** GOVERNANCE ACTIONS *****
  // ***************************************

  /// @notice Controller can claim coins that are somehow transferred into the contract
  ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
  /// @param recipient Recipient address
  /// @param token Token address
  function salvageFromPipeline(address recipient, address token)
  external override {
    _onlyControllerOrGovernance();
    // transfers token to this contract
    _salvageFromAllPipes(recipient, token);
    emit SalvagedFromPipeline(recipient, token);
    _updateTotalAmount();
  }

  function rebalanceAllPipes() external override hardWorkers {
    _rebalanceAllPipes();
    _updateTotalAmount();
  }

  /// @dev Announce a pipe replacement
  function announcePipeReplacement(uint pipeIndex, address newPipe)
  external {
    _onlyControllerOrGovernance();
    require(newPipe != address(0), "AMB: newPipe is 0");
    require(_TIMELOCKS.uintAt(pipeIndex) == 0, "AMB: Already defined");
    _TIMELOCKS.setAt(pipeIndex, block.timestamp + _TIME_LOCK);
    _TIMELOCK_ADDRESSES.setAt(pipeIndex, newPipe);
    emit PipeReplaceAnnounced(pipeIndex, newPipe);
  }

  /// @dev Replaces a pipe with index
  /// @param pipeIndex - index of the pipe to replace
  /// @param newPipe - address of the new pipe
  /// @param maxDecrease1000 - maximum total amount decrease in 0,1%
  function replacePipe(uint pipeIndex, address newPipe, uint maxDecrease1000)
  external {
    _onlyControllerOrGovernance();
    uint timelock = _TIMELOCKS.uintAt(pipeIndex);
    require(timelock != 0 && timelock < block.timestamp, "AMB: Too early");
    require(_TIMELOCK_ADDRESSES.addressAt(pipeIndex) == newPipe, "AMB: Wrong address");

    _replacePipe(pipeIndex, IPipe(newPipe), maxDecrease1000);

    _TIMELOCKS.setAt(pipeIndex, 0);
    _TIMELOCK_ADDRESSES.setAt(pipeIndex, 0);
    _updateTotalAmount();
  }

  // !!! decrease gap size after adding variables!!!
  //slither-disable-next-line unused-state
  uint[32] private ______gap;
}
*/
