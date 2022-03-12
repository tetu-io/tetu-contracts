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

import "./../../../openzeppelin/SafeERC20.sol";
import "./../../../third_party/IERC20Extended.sol";
import "./../ProxyStrategyBase.sol";
import "./pipelines/LinearPipeline.sol";
import "../../SlotsLib.sol";
import "../../interface/strategies/IMaiStablecoinPipe.sol";
import "../../interface/strategies/IAaveMaiBalStrategyBase.sol";
import "hardhat/console.sol";// TODO remove


/// @title MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract MaiBalStrategyBase is ProxyStrategyBase, LinearPipeline, IAaveMaiBalStrategyBase {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  /// @notice Strategy type for statistical purposes
  string private constant _STRATEGY_NAME = "AaveMaiBalStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string private constant _VERSION = "2.0.0";
  /// @dev 10% buyback
  uint256 private constant _BUY_BACK_RATIO = 10_00;

  bytes32 internal constant _TOTAL_AMOUNT_OUT_SLOT    = bytes32(uint256(keccak256("eip1967.AaveMaiBalStrategyBase.totalAmountOut")) - 1);
  bytes32 internal constant _MAI_STABLECOIN_PIPE_SLOT = bytes32(uint256(keccak256("eip1967.AaveMaiBalStrategyBase._maiStablecoinPipe")) - 1);
  bytes32 internal constant _INTERIM_SWAP_TOKEN_SLOT  = bytes32(uint256(keccak256("eip1967.AaveMaiBalStrategyBase._interimSwapToken")) - 1);
  /// @dev Assets should reflect underlying tokens for investing
  bytes32 internal constant _ASSET_SLOT               = bytes32(uint256(keccak256("eip1967.AaveMaiBalStrategyBase._asset")) - 1);

  event SalvagedFromPipeline(address recipient, address token);
  event SetTargetPercentage(uint256 _targetPercentage);
  event SetMaxImbalance(uint256 _maxImbalance);

  /// @notice Contract initializer
  function initializeAaveMaiBalStrategyBase(
    address _controller,
    address _underlyingToken,
    address _vault,
    address[] memory __rewardTokens,
    address __interimSwapToken
  ) public initializer
  {
    require(_controller != address(0), "Zero controller");
    require(_underlyingToken != address(0), "Zero underlying");
    require(_vault != address(0), "Zero vault");


    initializeStrategyBase(_controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO);
    initializeLinearPipeline(_underlyingToken);

    _INTERIM_SWAP_TOKEN_SLOT.set(__interimSwapToken);
    _ASSET_SLOT.set(_underlyingToken);
  }

  //************************ MODIFIERS **************************

  /// @dev Only for Governance/Controller.
  modifier onlyControllerOrGovernance() {
    require(msg.sender == address(_controller())
      || IController(_controller()).governance() == msg.sender,
      "AMB: Not Gov or Controller");
    _;
  }

  modifier updateTotalAmount() {
    _;
    _TOTAL_AMOUNT_OUT_SLOT.set(getTotalAmountOut());
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

  function _maiStablecoinPipe() internal view returns (IMaiStablecoinPipe) {
    return IMaiStablecoinPipe(_MAI_STABLECOIN_PIPE_SLOT.getAddress());
  }

  function interimSwapToken() external view returns (address) {
    return _interimSwapToken();
  }

  function _interimSwapToken() internal view returns (address) {
    return _INTERIM_SWAP_TOKEN_SLOT.getAddress();
  }

  // ********************************************************

  /// @dev Returns reward pool balance
  function _rewardPoolBalance() internal override view returns (uint256 bal) {
    return _totalAmountOut();
  }

  /// @dev HardWork function for Strategy Base implementation
  function doHardWork()
  external override onlyNotPausedInvesting hardWorkers updateTotalAmount {
    IERC20 __underlying = IERC20(_underlying());
    uint balance = __underlying.balanceOf(address(this));
    if (balance > 0) {
      _pumpIn(balance);
    }
    _rebalanceAllPipes();
    _claimFromAllPipes();
    uint claimedUnderlying = __underlying.balanceOf(address(this));
//    _swapRewardsToInterimToken();
    autocompound();
    uint acAndClaimedUnderlying = __underlying.balanceOf(address(this));
    uint toSupply = acAndClaimedUnderlying - claimedUnderlying;
    if (toSupply > 0) {
      _pumpIn(toSupply);
    }
    liquidateRewardDefault();
  }

  /// @dev Swaps rewards to intermediate token (designed for tokens with too long route)
  function _swapRewardsToInterimToken() internal {
    IFeeRewardForwarder forwarder = IFeeRewardForwarder(IController(_controller()).feeRewardForwarder());
    address __underlying = _underlying();
    address interimToken = _interimSwapToken();
    uint len = _rewardTokens.length;
    for (uint i = 0; i < len; ++i) {
      address rt = _rewardTokens[i];
      if (rt == __underlying || rt == interimToken) continue;
      uint amount = IERC20(rt).balanceOf(address(this));
      console.log('===rt', rt); // TODO remove
      console.log('===amount', amount);// TODO remove
      if (amount != 0) {
        IERC20(rt).safeApprove(address(forwarder), 0);
        IERC20(rt).safeApprove(address(forwarder), amount);
        forwarder.liquidate(rt, interimToken, amount);
      }
    }
  }


  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 underlyingAmount) internal override updateTotalAmount {
    _pumpIn(underlyingAmount);
  }

  /// @dev Function to withdraw from pool
  function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override updateTotalAmount {
    // don't claim on withdraw
    // update cached _totalAmount, and recalculate amount
    uint256 newTotalAmount = getTotalAmountOut();
    uint256 amount = underlyingAmount * newTotalAmount / _totalAmountOut();
    _pumpOutSource(amount, 0);
  }

  /// @dev Emergency withdraws all most underlying from the pool
  function emergencyWithdrawFromPool() internal override updateTotalAmount {
    _pumpOut(_getMostUnderlyingBalance(), 0);
  }

  /// @dev Liquidate all reward tokens
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// ********************** EXTERNAL VIEWS **********************

  function STRATEGY_NAME() external pure override returns (string memory) {
    return _STRATEGY_NAME;
  }

  function VERSION() external pure returns (string memory) {
    return _VERSION;
  }

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

  /// @dev Gets targetPercentage of MaiStablecoinPipe
  /// @return target collateral to debt percentage
  function targetPercentage() external view override returns (uint256) {
    return _maiStablecoinPipe().targetPercentage();
  }

  /// @dev Gets maxImbalance of MaiStablecoinPipe
  /// @return maximum imbalance (+/-%) to do re-balance
  function maxImbalance() external view override returns (uint256) {
    return _maiStablecoinPipe().maxImbalance();
  }

  /// @dev Gets collateralPercentage of MaiStablecoinPipe
  /// @return current collateral to debt percentage
  function collateralPercentage() external view override returns (uint256) {
    return _maiStablecoinPipe().collateralPercentage();
  }
  /// @dev Gets liquidationPrice of MaiStablecoinPipe
  /// @return price of source (am) token when vault will be liquidated
  function liquidationPrice() external view override returns (uint256 price) {
    price = _maiStablecoinPipe().liquidationPrice();
  }

  /// @dev Gets available MAI to borrow at the Mai Stablecoin contract. Should be checked at UI before deposit
  /// @return amToken maximum deposit
  function availableMai() external view override returns (uint256) {
    return _maiStablecoinPipe().availableMai();
  }

  /// @dev Returns maximal possible amToken deposit. Should be checked at UI before deposit
  /// @return max amToken maximum deposit
  function maxDeposit() external view override returns (uint256 max) {
    max = _maiStablecoinPipe().maxDeposit();
  }

  // ***************************************
  // ************** GOVERNANCE ACTIONS *****
  // ***************************************

  /// @notice Controller can claim coins that are somehow transferred into the contract
  ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
  /// @param recipient Recipient address
  /// @param token Token address
  function salvageFromPipeline(address recipient, address token)
  external override onlyControllerOrGovernance updateTotalAmount {
    // transfers token to this contract
    _salvageFromAllPipes(recipient, token);
    emit SalvagedFromPipeline(recipient, token);
  }

  function rebalanceAllPipes() external override hardWorkers updateTotalAmount {
    _rebalanceAllPipes();
  }

  /// @dev Sets targetPercentage for MaiStablecoinPipe and re-balances all pipes
  /// @param _targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 _targetPercentage)
  external override onlyControllerOrGovernance updateTotalAmount {
    _maiStablecoinPipe().setTargetPercentage(_targetPercentage);
    emit SetTargetPercentage(_targetPercentage);
    _rebalanceAllPipes();
  }


  /// @dev Sets maxImbalance for maiStablecoinPipe and re-balances all pipes
  /// @param _maxImbalance - maximum imbalance deviation (+/-%)
  function setMaxImbalance(uint256 _maxImbalance)
  external override onlyControllerOrGovernance updateTotalAmount {
    _maiStablecoinPipe().setMaxImbalance(_maxImbalance);
    emit SetMaxImbalance(_maxImbalance);
    _rebalanceAllPipes();
  }

  // !!! decrease gap size after adding variables!!!
  //slither-disable-next-line unused-state
  uint[32] private ______gap;
}
