//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "./IRewarder.sol";

interface IMiniChefV2 {

  function rewarder(uint256 _pid) external view returns (IRewarder);

  function deposit(uint256 _pid, uint256 _amount, address to) external;

  function withdraw(uint256 _pid, uint256 _amount, address to) external;

  function harvest(uint256 _pid, address to) external;

  function withdrawAndHarvest(uint256 _pid, uint256 _amount, address to) external;

  function emergencyWithdraw(uint256 _pid, address to) external;

  // **************** VIEWS ***************

  function userInfo(uint256 _pid, address _user)
  external view returns (uint256 amount, uint256 rewardDebt);

  function lpToken(uint256 _pid) external view returns (address);

  function poolLength() external view returns (uint256);

  function sushiPerSecond() external view returns (uint256);

  function totalAllocPoint() external view returns (uint256);

  function poolInfo(uint256 _pid)
  external view returns (uint256 accSushiPerShare, uint256 lastRewardTime, uint256 allocPoint);
}
