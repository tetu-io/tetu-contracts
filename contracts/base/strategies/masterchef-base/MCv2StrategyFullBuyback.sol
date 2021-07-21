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

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IMiniChefV2.sol";
import "../StrategyBase.sol";

abstract contract MCv2StrategyFullBuyback is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  string public constant STRATEGY_TYPE = "mcv2StrategyFullBuyback";
  string public constant VERSION = "0";
  uint256 private constant BUY_BACK_RATIO = 10000; // for non full buyback need to implement liquidation

  // masterchef rewards pool
  address public mcRewardPool;
  // masterchef rewards pool ID
  uint256 public poolID;

  constructor(
    address _storage,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _mcRewardPool,
    uint256 _poolID
  ) StrategyBase(_storage, _underlying, _vault, __rewardTokens, BUY_BACK_RATIO) {
    require(_mcRewardPool != address(0), "zero address pool");
    mcRewardPool = _mcRewardPool;
    poolID = _poolID;

    address _lpt = IMiniChefV2(_mcRewardPool).lpToken(_poolID);
    require(_lpt == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  function rewardPoolBalance() public override view returns (uint256 bal) {
    (bal,) = IMiniChefV2(mcRewardPool).userInfo(poolID, address(this));
  }

  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](2);
    (uint256 bal, uint256 debt) = IMiniChefV2(mcRewardPool).userInfo(poolID, address(this));

    (uint256 accSushiPerShare, uint256 lastRewardTime, uint256 allocPoint)
    = IMiniChefV2(mcRewardPool).poolInfo(poolID);

    if (block.timestamp > lastRewardTime) {
      uint256 sushiPerSecond = IMiniChefV2(mcRewardPool).sushiPerSecond();
      uint256 totalAllocPoint = IMiniChefV2(mcRewardPool).totalAllocPoint();
      uint256 lpSupply = IERC20(IMiniChefV2(mcRewardPool).lpToken(poolID)).balanceOf(mcRewardPool);
      if (lpSupply > 0) {
        uint256 time = block.timestamp.sub(lastRewardTime);
        uint256 sushiReward = time.mul(sushiPerSecond).mul(allocPoint).div(totalAllocPoint);
        accSushiPerShare = accSushiPerShare.add(sushiReward.mul(1e12).div(lpSupply));
      }
    }

    uint256 accumulatedSushi = bal * accSushiPerShare / 1e12;
    if (accumulatedSushi < debt) {
      toClaim[0] = 0;
    } else {
      toClaim[0] = accumulatedSushi - debt;
    }

    IRewarder _rewarder = IMiniChefV2(mcRewardPool).rewarder(poolID);
    if (address(_rewarder) != address(0)) {
      // we can't calculate more accurate because totalAllocPoint is private in the rewarder contract
      toClaim[1] = _rewarder.pendingToken(poolID, address(this));
    }

    return toClaim;
  }

  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(mcRewardPool);
  }

  function poolWeeklyRewardsAmount() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](2);
    rewards[0] = computeSushiWeeklyPoolReward();
    rewards[1] = computeMaticWeeklyPoolReward();
    return rewards;
  }

  function computeSushiWeeklyPoolReward() public view returns (uint256) {
    (, uint256 lastRewardTime, uint256 allocPoint)
    = IMiniChefV2(mcRewardPool).poolInfo(poolID);
    uint256 time = block.timestamp - lastRewardTime;
    uint256 sushiPerSecond = IMiniChefV2(mcRewardPool).sushiPerSecond();
    uint256 totalAllocPoint = IMiniChefV2(mcRewardPool).totalAllocPoint();
    uint256 sushiReward = time.mul(sushiPerSecond).mul(allocPoint).div(totalAllocPoint);
    return sushiReward * (1 weeks / time);
  }

  function computeMaticWeeklyPoolReward() public view returns (uint256) {
    IRewarder rewarder = IMiniChefV2(mcRewardPool).rewarder(poolID);
    (, uint256 lastRewardTime, uint256 allocPoint)
    = rewarder.poolInfo(poolID);
    uint256 time = block.timestamp - lastRewardTime;
    uint256 rewardsPerSecond = rewarder.rewardPerSecond();
    // totalAllocPoint is not public so assume that it is the same as MC
    uint256 totalAllocPoint = IMiniChefV2(mcRewardPool).totalAllocPoint();
    uint256 sushiReward = time.mul(rewardsPerSecond).mul(allocPoint).div(totalAllocPoint);
    return sushiReward * (1 weeks * 1e18 / time) / 1e18;
  }

  // ************ GOVERNANCE ACTIONS **************************

  function doHardWork() external onlyNotPausedInvesting override restricted {
    exitRewardPool();
    liquidateReward();
    investAllUnderlying();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(mcRewardPool, 0);
    IERC20(_underlyingToken).safeApprove(mcRewardPool, amount);
    IMiniChefV2(mcRewardPool).deposit(poolID, amount, address(this));
  }

  function withdrawAndClaimFromPool(uint256 amount) internal override {
    (uint256 bal, uint256 debt) = IMiniChefV2(mcRewardPool).userInfo(poolID, address(this));
    (uint256 accSushiPerShare, ,) = IMiniChefV2(mcRewardPool).poolInfo(poolID);
    uint256 accumulatedSushi = bal * accSushiPerShare / 1e12;
    if (accumulatedSushi < debt) {
      // sushi has a bug with rounding, in some cases we can't withdrawAndHarvest
      IMiniChefV2(mcRewardPool).emergencyWithdraw(poolID, address(this));
    } else {
      IMiniChefV2(mcRewardPool).withdrawAndHarvest(poolID, amount, address(this));
    }
  }

  function emergencyWithdrawFromPool() internal override {
    IMiniChefV2(mcRewardPool).emergencyWithdraw(poolID, address(this));
  }

  function liquidateReward() internal override {
    liquidateRewardDefault();
  }
}
