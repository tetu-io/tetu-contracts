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

pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IWexPolyMaster.sol";
import "../StrategyBase.sol";

abstract contract WaultStrategyFullBuyback is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  string public constant STRATEGY_TYPE = "mcv2StrategyFullBuyback";
  string public constant VERSION = "0";
  uint256 private constant BUY_BACK_RATIO = 10000; // for non full buyback need to implement liquidation

  // masterchef rewards pool
  address public pool;
  // masterchef rewards pool ID
  uint256 public poolID;

  constructor(
    address _storage,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool,
    uint256 _poolID
  ) StrategyBase(_storage, _underlying, _vault, __rewardTokens, BUY_BACK_RATIO) {
    require(_pool != address(0), "zero address pool");
    pool = _pool;
    poolID = _poolID;

    (IERC20 lpToken,,,) = IWexPolyMaster(_pool).poolInfo(_poolID);
    require(address(lpToken) == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  function rewardPoolBalance() public override view returns (uint256 bal) {
    (bal,,) = IWexPolyMaster(pool).userInfo(poolID, address(this));
  }

  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = IWexPolyMaster(pool).pendingWex(poolID, address(this));
    return toClaim;
  }

  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(pool);
  }

  function poolWeeklyRewardsAmount() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = computeWaultWeeklyPoolReward();
    return rewards;
  }

  function computeWaultWeeklyPoolReward() public view returns (uint256) {
    (, uint256 allocPoint, uint256 lastRewardBlock,) = IWexPolyMaster(pool).poolInfo(poolID);
    uint256 time = block.number - lastRewardBlock;
    uint256 wexPerBlock = IWexPolyMaster(pool).wexPerBlock();
    uint256 totalAllocPoint = IWexPolyMaster(pool).totalAllocPoint();
    uint256 sushiReward = time.mul(wexPerBlock).mul(allocPoint).div(totalAllocPoint);
    uint256 averageBlockTime = 5;
    return sushiReward * (1 weeks * 1e18 / time / averageBlockTime) / 1e18;
  }

  // ************ GOVERNANCE ACTIONS **************************

  function doHardWork() external onlyNotPausedInvesting override restricted {
    // wault WEXpoly pool has the same underlying and reward token
    // need to be sure that we don't liquidate invested funds
    investAllUnderlying();
    // only claim rewards
    IWexPolyMaster(pool).claim(poolID);
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(pool, 0);
    IERC20(_underlyingToken).safeApprove(pool, amount);
    IWexPolyMaster(pool).deposit(poolID, amount, false);
  }

  function withdrawAndClaimFromPool(uint256 amount) internal override {
    IWexPolyMaster(pool).withdraw(poolID, amount, true);
  }

  function emergencyWithdrawFromPool() internal override {
    IWexPolyMaster(pool).emergencyWithdraw(poolID);
  }

  function liquidateReward() internal override {
    liquidateRewardDefault();
  }


}
