// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IStakingRewardsFactoryV2 {
  // info about rewards for a particular staking token
  struct StakingRewardsInfo {
    address stakingRewards;
    address rewardsTokenA;
    address rewardsTokenB;
    uint256 rewardAmountA;
    uint256 rewardAmountB;
    uint256 duration;
  }

  function stakingRewardsGenesis() external view returns (uint);

  function stakingTokens(uint256 idx) external view returns (address);

  function stakingRewardsInfoByStakingToken(address _adr) external view returns (StakingRewardsInfo memory);

}
