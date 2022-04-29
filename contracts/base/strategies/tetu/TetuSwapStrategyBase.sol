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

import "../StrategyBase.sol";
import "../../../swap/interfaces/ITetuSwapPair.sol";
import "../../interface/ISmartVault.sol";

/// @title Abstract contract for Tetu swap strategy implementation
/// @author belbix
abstract contract TetuSwapStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "TetuSwapStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.2";
  /// @dev 10% buybacks
  uint256 private constant _BUY_BACK_RATIO = 10_00;
  /// @dev Used to prevent double profit liquidation in case of hardwork fail
  /// @dev Necessary because first we liquidate profit and then add liquidity
  bool private liquidated;

  /// @notice TetuSwap pair
  address public pair;

  /// @notice Uniswap router for underlying LP
  address public router;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _router
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_vault != address(0), "Zero vault");
    require(_underlying != address(0), "Zero underlying");
    pair = _underlying;
    _rewardTokens.push(ITetuSwapPair(pair).token0());
    _rewardTokens.push(ITetuSwapPair(pair).token1());
    router = _router;
  }

  // ************* VIEWS *******************

  /// @notice Stabbed to 0
  function rewardPoolBalance() public override pure returns (uint256) {
    return 0;
  }

  /// @notice Stabbed to 0
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](rewardTokens().length);
    return rewards;
  }

  /// @notice Pair total supply
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(pair).totalSupply();
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    ITetuSwapPair(pair).claimAll();
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev No operations
  function depositToPool(uint256 amount) internal override {
    // noop
  }

  /// @dev No operations
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    // noop
  }

  /// @dev No operations
  function emergencyWithdrawFromPool() internal override {
    // noop
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {

    // assume only xTetu rewards exist
    address rt = IController(controller()).psVault();

    // it is redirected rewards - PS already had their part of income
    // in case of pair with xTETU-XXX we not able to separate it
    uint256 amount = IERC20(rt).balanceOf(address(this));
    if (amount > 0) {
      IERC20(rt).safeApprove(_smartVault, 0);
      IERC20(rt).safeApprove(_smartVault, amount);
      ISmartVault(_smartVault).notifyTargetRewardAmount(rt, amount);
    }
    // first liquidate rewards if bb ratio != 0 and we do not fail previous hardwork after liquidation
    if (!liquidated && _buyBackRatio != 0) {
      liquidateRewardTetuSwap();
    }
    liquidated = true;
    // then autocompound the whole remainder
    autocompoundTetuSwapLP();
    // set liquidated to false because hardwork is succeeded and next time need to liquidate reward again
    liquidated = false;
  }

  function autocompoundTetuSwapLP() internal {
    address forwarder = IController(controller()).feeRewardForwarder();

    address token0;
    address token1;

    // define token0 and token1
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      if (_rewardTokens[i] == ITetuSwapPair(pair).token0()) {
        token0 = _rewardTokens[i];
      }
      if (_rewardTokens[i] == ITetuSwapPair(pair).token1()) {
        token1 = _rewardTokens[i];
      }
    }

    uint amountToAddLiquidityToken0 = IERC20(token0).balanceOf(address(this));
    uint amountToAddLiquidityToken1 = IERC20(token1).balanceOf(address(this));

    // autocompound all that we can liquidate at start
    if (amountToAddLiquidityToken0 >= 1 && amountToAddLiquidityToken1 >= 1) {
      IERC20(token0).safeApprove(router, 0);
      IERC20(token0).safeApprove(router, amountToAddLiquidityToken0);
      IERC20(token1).safeApprove(router, 0);
      IERC20(token1).safeApprove(router, amountToAddLiquidityToken1);
      IUniswapV2Router02(router).addLiquidity(
        token0,
        token1,
        amountToAddLiquidityToken0,
        amountToAddLiquidityToken1,
        1,
        1,
        address(this),
        block.timestamp
      );
    }
    uint token0amount = 0;
    uint token1amount = 0;

    if (IERC20(token0).balanceOf(address(this)) > 0 || IERC20(token1).balanceOf(address(this)) > 0) {
      // try to swap the whole remainder of one reward token to another
      if (IERC20(token0).balanceOf(address(this)) > 0 && IERC20(token1).balanceOf(address(this)) > 0) {
        IERC20(token0).safeApprove(forwarder, 0);
        IERC20(token0).safeApprove(forwarder, IERC20(token0).balanceOf(address(this)));
        try IFeeRewardForwarder(forwarder).liquidate(token0, token1, IERC20(token0).balanceOf(address(this))) {}
        catch {
          IERC20(token1).safeApprove(forwarder, 0);
          IERC20(token1).safeApprove(forwarder, IERC20(token1).balanceOf(address(this)));
          IFeeRewardForwarder(forwarder).liquidate(token1, token0, IERC20(token1).balanceOf(address(this)));
        }
      }
      // after previous step all of rewards are in one token
      // if all of rewards in token0 swap the half to token1
      // else swap the half of token1 to token0
      if (IERC20(token0).balanceOf(address(this)) > 0) {
        IERC20(token0).safeApprove(forwarder, 0);
        IERC20(token0).safeApprove(forwarder, IERC20(token0).balanceOf(address(this)) / 2);
        token1amount = IFeeRewardForwarder(forwarder).liquidate(token0, token1, IERC20(token0).balanceOf(address(this)) / 2);
        require(token1amount != 0, "SB: Token0 zero amount");
      }
      else {
        IERC20(token1).safeApprove(forwarder, 0);
        IERC20(token1).safeApprove(forwarder, IERC20(token1).balanceOf(address(this)) / 2);
        token0amount = IFeeRewardForwarder(forwarder).liquidate(token1, token0, IERC20(token1).balanceOf(address(this)) / 2);
        require(token0amount != 0, "SB: Token0 zero amount");
      }

      // now we have enough tokens to add maximum liquidity
      IERC20(token0).safeApprove(router, 0);
      IERC20(token0).safeApprove(router, IERC20(token0).balanceOf(address(this)));
      IERC20(token1).safeApprove(router, 0);
      IERC20(token1).safeApprove(router, IERC20(token1).balanceOf(address(this)));
      IUniswapV2Router02(router).addLiquidity(
        token0,
        token1,
        IERC20(token0).balanceOf(address(this)),
        IERC20(token1).balanceOf(address(this)),
        1,
        1,
        address(this),
        block.timestamp
      );
    }
  }

  function liquidateRewardTetuSwap() internal {
    address forwarder = IController(controller()).feeRewardForwarder();
    uint targetTokenEarnedTotal = 0;
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      uint256 amount = rewardBalance(i) * _buyBackRatio / _BUY_BACK_DENOMINATOR;
      if (amount != 0) {
        address rt = _rewardTokens[i];
        IERC20(rt).safeApprove(forwarder, 0);
        IERC20(rt).safeApprove(forwarder, amount);
        // it will sell reward token to Target Token and distribute it to SmartVault and PS
        uint256 targetTokenEarned = 0;
        try IFeeRewardForwarder(forwarder).distribute(amount, rt, _smartVault) returns (uint r) {
          targetTokenEarned = r;
        } catch {}
        targetTokenEarnedTotal += targetTokenEarned;
      }
      if (targetTokenEarnedTotal > 0) {
        IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarnedTotal);
      }
    }
  }
}