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

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../StrategyBase.sol";
import "./interfaces/SNXRewardInterface.sol";

/// @title Abstract contract for Synthetix strategy implementation
/// @author belbix
abstract contract SNXStrategyFullBuyback is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  string public constant STRATEGY_TYPE = "snxStrategyFullBuyback";
  string public constant VERSION = "1.0.0";
  uint256 private constant BUY_BACK_RATIO = 10000;  // for non full buyback need to implement liquidation

  SNXRewardInterface public rewardPool;

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _rewardPool
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, BUY_BACK_RATIO) {
    require(_rewardPool != address(0), "zero address pool");
    rewardPool = SNXRewardInterface(_rewardPool);
  }

  // ************* VIEWS *******************

  function rewardPoolBalance() public override view returns (uint256) {
    return rewardPool.balanceOf(address(this));
  }

  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = rewardPool.earned(address(this));
    return toClaim;
  }

  function poolTotalAmount() external view override returns (uint256) {
    return rewardPool.totalSupply();
  }

  function poolWeeklyRewardsAmount() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);

    uint256 rtBalance = IERC20(rewardTokens()[0]).balanceOf(address(rewardPool));
    uint256 time = rewardPool.periodFinish() - rewardPool.lastUpdateTime();
    rewards[0] = rtBalance * (1 weeks * 1e18 / time) / 1e18;

    return rewards;
  }

  // ************ GOVERNANCE ACTIONS **************************

  function doHardWork() external onlyNotPausedInvesting override restricted {
    rewardPool.getReward();
    liquidateReward();
    investAllUnderlying();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(address(rewardPool), 0);
    IERC20(_underlyingToken).safeApprove(address(rewardPool), amount);
    rewardPool.stake(amount);
  }

  function withdrawAndClaimFromPool(uint256 amount) internal override {
    rewardPool.withdraw(amount);
  }

  function emergencyWithdrawFromPool() internal override {
    rewardPool.exit();
  }

  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

}
