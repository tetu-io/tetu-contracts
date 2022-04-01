// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface IStakingDualRewards {

  function rewardsTokenA() external view returns (IERC20);

  function rewardsTokenB() external view returns (IERC20);

  function stakingToken() external view returns (IERC20);

  function periodFinish() external view returns (uint256);

  function rewardRateA() external view returns (uint256);

  function rewardRateB() external view returns (uint256);

  function lastUpdateTime() external view returns (uint256);

  function rewardPerTokenAStored() external view returns (uint256);

  function rewardPerTokenBStored() external view returns (uint256);

  function userRewardPerTokenAPaid(address _adr) external view returns (uint256);

  function userRewardPerTokenBPaid(address _adr) external view returns (uint256);

  function rewardsA(address _adr) external view returns (uint256);

  function rewardsB(address _adr) external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function lastTimeRewardApplicable() external view returns (uint256);

  function rewardPerTokenA() external view returns (uint256);

  function rewardPerTokenB() external view returns (uint256);

  function earnedA(address account) external view returns (uint256);

  function earnedB(address account) external view returns (uint256);

  // Mutative
  function stake(uint256 amount) external;

  function withdraw(uint256 amount) external;

  function getReward() external;

  function exit() external;

}
