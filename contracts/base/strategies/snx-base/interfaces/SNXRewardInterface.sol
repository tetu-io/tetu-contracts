//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

interface SNXRewardInterface {
  function withdraw(uint) external;

  function getReward() external;

  function stake(uint) external;

  function exit() external;

  function balanceOf(address) external view returns (uint256);

  function earned(address account) external view returns (uint256);

  function periodFinish() external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function lastUpdateTime() external view returns (uint256);

}
