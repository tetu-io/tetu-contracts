// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface ISpookyMasterChef {

  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
  }

  struct PoolInfo {
    address lpToken;           // Address of LP token contract.
    uint256 allocPoint;       // How many allocation points assigned to this pool. BOOs to distribute per block.
    uint256 lastRewardTime;  // Last block time that BOOs distribution occurs.
    uint256 accBOOPerShare; // Accumulated BOOs per share, times 1e12. See below.
  }

  function boo() external view returns (address);

  function devaddr() external view returns (address);

  function booPerSecond() external view returns (uint256);

  function poolInfo(uint256 _pid) external view returns (PoolInfo memory);

  function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);

  function totalAllocPoint() external view returns (uint256);

  function startTime() external view returns (uint256);

  function maxBooPerSecond() external view returns (uint256);

  function MaxAllocPoint() external view returns (uint256);

  function poolLength() external view returns (uint256);

  function getMultiplier(uint256 _from, uint256 _to) external pure returns (uint256);

  function pendingBOO(uint256 _pid, address _user)
  external
  view
  returns (uint256);

  function massUpdatePools() external;

  function updatePool(uint256 _pid) external;

  function deposit(uint256 _pid, uint256 _amount) external;

  function withdraw(uint256 _pid, uint256 _amount) external;

  function emergencyWithdraw(uint256 _pid) external;
}
