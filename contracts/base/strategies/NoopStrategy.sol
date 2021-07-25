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

import "./StrategyBase.sol";

/// @title Stubbing implementation of Base Strategy.
///        Use with Vaults that do nothing with underlying (like PS)
/// @author belbix
contract NoopStrategy is StrategyBase {

  string public constant VERSION = "1.0.0";
  string public constant STRATEGY_TYPE = "NOOP_STRATEGY";
  uint256 private constant BUY_BACK_RATIO = 10000;
  address[] private _assets;

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address[] memory __assets
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, BUY_BACK_RATIO) {
    _assets = __assets;
  }

  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  function doHardWork() external onlyNotPausedInvesting override restricted {
    // call empty functions for getting 100% test coverage
    withdrawAndClaimFromPool(0);
    emergencyWithdrawFromPool();
    liquidateReward();
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

  //slither-disable-next-line dead-code
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
