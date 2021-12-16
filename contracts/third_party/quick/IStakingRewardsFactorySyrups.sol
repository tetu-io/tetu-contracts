// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IStakingRewardsFactorySyrups {

  // info about rewards for a particular staking token
  struct StakingRewardsInfo {
    address stakingRewards;
    uint rewardAmount;
    uint duration;
  }

  function stakingToken() external view returns (address);

  function stakingRewardsGenesis() external view returns (uint);

  function rewardTokens(uint256 idx) external view returns (address);

  function stakingRewardsInfoByRewardToken(address _adr) external view returns (StakingRewardsInfo memory);

}
