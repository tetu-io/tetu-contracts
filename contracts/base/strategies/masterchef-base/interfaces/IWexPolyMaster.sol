//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
