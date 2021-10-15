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
