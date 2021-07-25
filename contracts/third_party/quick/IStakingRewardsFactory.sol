// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IStakingRewardsFactory {
  // info about rewards for a particular staking token
  struct StakingRewardsInfo {
    address stakingRewards;
    uint rewardAmount;
    uint duration;
  }

  function rewardsToken() external view returns (address);

  function stakingRewardsGenesis() external view returns (uint);

  function stakingTokens(uint256 idx) external view returns (address);

  function stakingRewardsInfoByStakingToken(address _adr) external view returns (StakingRewardsInfo memory);

}
