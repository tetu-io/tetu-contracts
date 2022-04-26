// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface IStakingRewards {
  // Mutative
  function stake(uint256 amount) external;

  function withdraw(uint256 amount) external;

  function getReward() external;

  function exit() external;

  // Views
  function lastTimeRewardApplicable() external view returns (uint256);

  function rewardPerToken() external view returns (uint256);

  function earned(address account) external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function rewardsToken() external view returns (IERC20);

  function stakingToken() external view returns (IERC20);

  function periodFinish() external view returns (uint256);

  function rewardRate() external view returns (uint256);

  function lastUpdateTime() external view returns (uint256);

  function rewardPerTokenStored() external view returns (uint256);
}
