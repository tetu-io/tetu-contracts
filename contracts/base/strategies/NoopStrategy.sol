//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "./StrategyBase.sol";

contract NoopStrategy is StrategyBase {

  string public constant VERSION = "0";
  string public constant STRATEGY_TYPE = "NOOP_STRATEGY";
  uint256 private constant BUY_BACK_RATIO = 10000;
  address[] private _assets;

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory _rewardTokens,
    address[] memory __assets
  ) StrategyBase(_controller, _underlying, _vault, _rewardTokens, BUY_BACK_RATIO) {
    _assets = __assets;
  }

  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  function doHardWork() external onlyNotPausedInvesting override restricted {
    // noop
  }

  function depositToPool(uint256 amount) internal override {
    // noop
  }

  function withdrawAndClaimFromPool(uint256 amount) internal override {
    //noop
  }

  function emergencyWithdrawFromPool() internal override {
    //noop
  }

  function liquidateReward() internal override {
    // noop
  }

  function platform() external override pure returns (string memory) {
    return "NOOP";
  }

  function assets() external override view returns (address[] memory) {
    return _assets;
  }

  function readyToClaim() external pure override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    return toClaim;
  }

  function poolTotalAmount() external pure override returns (uint256) {
    return 0;
  }

  function poolWeeklyRewardsAmount() external pure override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = 0;
    return rewards;
  }

}
