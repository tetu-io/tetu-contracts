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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../StrategyBase.sol";
import "../../../third_party/market/ICErc20.sol";

/// @title Abstract contract for Market strategy implementation
/// @author iamkosyak
abstract contract MarketBaseStrategy is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "MarketBaseStrategy";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev No reward tokens
  address[] private _REWARD_TOKENS;
  /// @dev Threshold for partially decompound
  uint internal constant _MIN_RATE_CHANGE = 100;
  /// @dev Threshold for liquidation process
  uint internal constant _MIN_PROFIT = 100;

  /// @notice Pool with rewards
  address public pool;
  /// @dev We will use it for calculate how much we can move to buybacks
  uint public lastPoolExchangeRate;

  event Decompound(address token, uint liquidated, uint result);

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address _pool,
    uint __buyBackRatio
  ) StrategyBase(_controller, _underlying, _vault, _REWARD_TOKENS, __buyBackRatio) {
    require(_pool != address(0), "Zero address pool");
    pool = _pool;
    require(ICErc20(pool).underlying() == _underlying, "Wrong underlying");

    // we will use TETU token in liquidation process
    _rewardTokens.push(IController(controller()).rewardToken());
    // need for return toClaim result without additional computations
    _rewardTokens.push(_underlying);
  }

  // ************* VIEWS *******************

  /// @notice Strategy underlying balance in the pool
  /// @return Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint) {
    return _rewardPoolBalance();
  }

  function _rewardPoolBalance() internal view returns (uint) {
    return ICErc20(pool).balanceOf(address(this)) * ICErc20(pool).exchangeRateStored() / 1e18;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in the pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint[] memory) {
    uint[] memory toClaim = new uint[](_rewardTokens.length);
    // amount denominated in TETU too hard to calculate
    // 0 token is zero amount
    toClaim[1] = _expectedProfitAmount(ICErc20(pool).exchangeRateStored());
    return toClaim;
  }

  /// @notice TVL of the underlying in the pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint) {
    return ICErc20(pool).totalSupply() * ICErc20(pool).exchangeRateStored() / 1e18;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    investAllUnderlying();
    _partiallyDecompound();
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal override {
    // decompound and update exchange rate for be sure that new assets will be not decompounded with wrong rate
    _partiallyDecompound();
    ICErc20(_underlyingToken).approve(pool, amount);
    ICErc20(pool).mint(amount);
  }

  /// @dev Withdraw underlying
  /// @param amount Withdraw amount
  function withdrawAndClaimFromPool(uint amount) internal override {
    // don't decompound for cheap withdraw
    // we will not earn part of profit from withdrew assets
    _redeem(amount);
  }

  function _redeem(uint amount) internal returns (uint){
    uint toRedeem = Math.min(amount, ICErc20(pool).balanceOf(address(this)) * 1e18 / ICErc20(pool).exchangeRateCurrent());
    if (toRedeem > 1) {
      return ICErc20(pool).redeemUnderlying(toRedeem);
    } else {
      return 0;
    }
  }

  /// @dev Withdraw everything from external pool
  function exitRewardPool() internal override {
    uint toRedeem = IERC20(pool).balanceOf(address(this));
    if (toRedeem > 1) {
      ICErc20(pool).redeem(toRedeem);
    }
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    ICErc20(pool).redeem(IERC20(pool).balanceOf(address(this)));
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev This function must be called for each deposit (before mint).
  ///      It will take a part of profit based on exchange rate difference
  function _partiallyDecompound() internal {
    if (_buyBackRatio == 0) {
      // no action requires in case of 0 buyback
      return;
    }
    if (lastPoolExchangeRate == 0) {
      lastPoolExchangeRate = ICErc20(pool).exchangeRateCurrent();
      // we can't calculate properly without previous value
      return;
    }
    uint exchangeRateSnapshot = ICErc20(pool).exchangeRateCurrent();
    uint profit = _expectedProfitAmount(exchangeRateSnapshot);
    if (profit == 0) {
      return;
    }

    // withdraw from pool to this contract
    uint toLiquidate = _redeem(profit);
    // liquidate profit to TETU tokens and keep them on this contract
    // it will be harvested on doHardWork call
    address forwarder = IController(controller()).feeRewardForwarder();
    IERC20(_underlyingToken).safeApprove(forwarder, 0);
    IERC20(_underlyingToken).safeApprove(forwarder, toLiquidate);
    uint result = IFeeRewardForwarder(forwarder).liquidate(
      _underlyingToken,
      _rewardTokens[0],
      toLiquidate
    );

    lastPoolExchangeRate = exchangeRateSnapshot;
    emit Decompound(_underlyingToken, toLiquidate, result);
  }

  /// @dev Returns possible profit that we can grab from current underlying
  function _expectedProfitAmount(uint currentRate) internal view returns (uint) {
    if (lastPoolExchangeRate == 0) {
      return 0;
    }

    if (lastPoolExchangeRate >= currentRate) {
      // in unrealistic case of decreasing no actions
      return 0;
    }
    uint rateChange = currentRate - lastPoolExchangeRate;
    if (rateChange < _MIN_RATE_CHANGE) {
      // no actions if profit too low
      return 0;
    }
    uint profitAmount = ICErc20(pool).balanceOf(address(this)) * rateChange / 1e18;
    uint profitAmountAdjusted = profitAmount * _buyBackRatio / _BUY_BACK_DENOMINATOR;
    if (profitAmountAdjusted < _MIN_PROFIT) {
      // no actions if profit too low
      return 0;
    }
    return profitAmountAdjusted;
  }
}
