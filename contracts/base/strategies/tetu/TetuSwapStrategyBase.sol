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
import "../../../swap/libraries/TetuSwapLibrary.sol";

/// @title Abstract contract for Tetu swap strategy implementation
/// @author belbix
abstract contract TetuSwapStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "TetuSwapStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.3";
  /// @dev 10% buybacks
  uint256 private constant _BUY_BACK_RATIO = 10_00;
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
    address forwarder = IController(controller()).feeRewardForwarder();
    // define tokens to add liquidity
    address token0 = ITetuSwapPair(pair).token0();
    address token1 = ITetuSwapPair(pair).token1();
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      if (rt != token0 && rt != token1) {
        uint256 amount = IERC20(rt).balanceOf(address(this));
        if (amount > 0) {
          IERC20(rt).safeApprove(_smartVault, 0);
          IERC20(rt).safeApprove(_smartVault, amount * _buyBackRatio / _BUY_BACK_DENOMINATOR);
          ISmartVault(_smartVault).notifyTargetRewardAmount(rt, amount * _buyBackRatio / _BUY_BACK_DENOMINATOR);
        }
      }
    }
    liquidateRewardTetuSwap();
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      if (rt != token0 && rt != token1) {
        // check to which token (0/1) liquuidate reward tokens
        uint256 t0BalBefore = IERC20(token0).balanceOf(address(this));
        uint256 t1BalBefore = IERC20(token1).balanceOf(address(this));
        (uint256 reserve0Before, uint256 reserve1Before,) = ITetuSwapPair(pair).getReserves();
        uint256 quote1Before = TetuSwapLibrary.quote(t0BalBefore, reserve0Before, reserve1Before);
        IERC20(rt).safeApprove(forwarder, 0);
        IERC20(rt).safeApprove(forwarder, IERC20(rt).balanceOf(address(this)));
        if (quote1Before > t1BalBefore) {
          IFeeRewardForwarder(forwarder).liquidate(rt, token1, IERC20(rt).balanceOf(address(this)));
        }
        else {
          IFeeRewardForwarder(forwarder).liquidate(rt, token0, IERC20(rt).balanceOf(address(this)));
        }
      }
    }
    uint256 t0BalAfter = IERC20(token0).balanceOf(address(this));
    uint256 t1BalAfter = IERC20(token1).balanceOf(address(this));
    (uint256 reserve0After, uint256 reserve1After,) = ITetuSwapPair(pair).getReserves();
    uint256 quote1After = TetuSwapLibrary.quote(1e18, reserve0After, reserve1After);
    if (quote1After == 1e18) {
      if (t0BalAfter > t1BalAfter) {
        IERC20(token0).safeApprove(forwarder, 0);
        IERC20(token0).safeApprove(forwarder, (t0BalAfter - t1BalAfter) / 2);
        IFeeRewardForwarder(forwarder).liquidate(token0, token1, (t0BalAfter - t1BalAfter) / 2);
      }
      else if (t1BalAfter > t0BalAfter) {
        IERC20(token1).safeApprove(forwarder, 0);
        IERC20(token1).safeApprove(forwarder, (t1BalAfter - t0BalAfter) / 2);
        IFeeRewardForwarder(forwarder).liquidate(token1, token0, (t1BalAfter - t0BalAfter) / 2);
      }
      else {}
    }
    else if (quote1After < 1e18) {
      uint256 amount = (t0BalAfter - quote1After * t1BalAfter / 1e18) / 2;
      IERC20(token0).safeApprove(forwarder, 0);
      IERC20(token0).safeApprove(forwarder, amount);
      IFeeRewardForwarder(forwarder).liquidate(token0, token1, amount);
    }
    else {
      uint256 amount = (quote1After * t1BalAfter / 1e18 - t0BalAfter) / 2;
      IERC20(token0).safeApprove(forwarder, 0);
      IERC20(token0).safeApprove(forwarder, amount);
      IFeeRewardForwarder(forwarder).liquidate(token0, token1, amount);
    }
    autocompoundTetuSwapLP(token0, token1);
  }

  function autocompoundTetuSwapLP(address token0, address token1) internal {
    uint amountToAddLiquidityToken0 = IERC20(token0).balanceOf(address(this));
    uint amountToAddLiquidityToken1 = IERC20(token1).balanceOf(address(this));
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