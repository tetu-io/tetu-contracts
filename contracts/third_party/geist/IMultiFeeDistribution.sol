// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IMultiFeeDistribution {

  struct RewardData {
    address token;
    uint256 amount;
  }

  function exit() external;

  function mint(address user, uint256 amount, bool withPenalty) external;

  function claimableRewards(address account) external view returns (RewardData[] memory rewards);

}
