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

import "../../openzeppelin/IERC20.sol";

interface IRewarder {
  function onSushiReward(uint256 pid, address user, address recipient, uint256 sushiAmount, uint256 newLpAmount) external;

  function pendingTokens(uint256 pid, address user, uint256 sushiAmount) external view returns (IERC20[] memory, uint256[] memory);

  function pendingToken(uint256 _pid, address _user) external view returns (uint256 pending);

  function rewardPerSecond() external view returns (uint256);

  function userInfo(uint256 _pid, address _user)
  external view returns (uint256 amount, uint256 rewardDebt);

  function poolInfo(uint256 _pid)
  external view returns (uint256 accSushiPerShare, uint256 lastRewardBlock, uint256 allocPoint);
}
