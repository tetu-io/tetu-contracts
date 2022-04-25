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

interface IWexPolyMaster {

  function deposit(uint256 _pid, uint256 _amount, bool _withdrawRewards) external;

  function withdraw(uint256 _pid, uint256 _amount, bool _withdrawRewards) external;

  function emergencyWithdraw(uint256 _pid) external;

  function claim(uint256 _pid) external;

  // *********** VIEWS ***********

  function poolLength() external view returns (uint256);

  function getMultiplier(uint256 _from, uint256 _to) external pure returns (uint256);

  function wexPerBlock() external view returns (uint256);

  function totalAllocPoint() external view returns (uint256);

  function startBlock() external view returns (uint256);

  function pendingWex(uint256 _pid, address _user) external view returns (uint256);

  function poolInfo(uint256 _pid) external view returns (
    IERC20 lpToken,
    uint256 allocPoint,
    uint256 lastRewardBlock,
    uint256 accWexPerShare
  );

  function userInfo(uint256 _pid, address _user) external view returns (
    uint256 amount,
    uint256 rewardDebt,
    uint256 pendingRewards
  );

}
