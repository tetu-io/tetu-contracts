// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IIronChef {

  struct UserInfo {
    uint256 amount;
    int256 rewardDebt;
  }

  struct PoolInfo {
    uint256 accRewardPerShare;
    uint256 lastRewardTime;
    uint256 allocPoint;
  }

  function reward() external view returns (address);

  function fund() external view returns (address);

  /// @notice Info of each MCV2 pool.
  function poolInfo(uint256 index) external view returns (PoolInfo memory);

  /// @notice Address of the LP token for each MCV2 pool.
  function lpToken(uint256 index) external view returns (address);

  /// @notice Address of each `IRewarder` contract in MCV2.
  function rewarder(uint256 index) external view returns (address);

  /// @notice Info of each user that stakes LP tokens.
  function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);

  /// @dev Total allocation points. Must be the sum of all allocation points in all pools.
  function totalAllocPoint() external view returns (uint256);

  function rewardPerSecond() external view returns (uint256);

  /// @notice Returns the number of MCV2 pools.
  function poolLength() external view returns (uint256);

  /// @notice View function to see pending reward on frontend.
  /// @param _pid The index of the pool. See `poolInfo`.
  /// @param _user Address of user.
  /// @return Pending reward for a given user.
  function pendingReward(uint256 _pid, address _user) external view returns (uint256);

  /// @notice Update reward variables of the given pool.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @return pool Returns the pool that was updated.
  function updatePool(uint256 pid) external returns (PoolInfo memory pool);

  /// @notice Update reward variables for all pools. Be careful of gas spending!
  /// @param pids Pool IDs of all to be updated. Make sure to update all active pools.
  function massUpdatePools(uint256[] calldata pids) external;

  /// @notice Deposit LP tokens to MCV2 for reward allocation.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @param amount LP token amount to deposit.
  /// @param to The receiver of `amount` deposit benefit.
  function deposit(uint256 pid, uint256 amount, address to) external;

  /// @notice Withdraw LP tokens from MCV2.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @param amount LP token amount to withdraw.
  /// @param to Receiver of the LP tokens.
  function withdraw(uint256 pid, uint256 amount, address to) external;

  /// @notice Harvest proceeds for transaction sender to `to`.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @param to Receiver of rewards.
  function harvest(uint256 pid, address to) external;

  /// @notice Withdraw LP tokens from MCV2 and harvest proceeds for transaction sender to `to`.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @param amount LP token amount to withdraw.
  /// @param to Receiver of the LP tokens and rewards.
  function withdrawAndHarvest(uint256 pid, uint256 amount, address to) external;

  /// @notice Withdraw without caring about rewards. EMERGENCY ONLY.
  /// @param pid The index of the pool. See `poolInfo`.
  /// @param to Receiver of the LP tokens.
  function emergencyWithdraw(uint256 pid, address to) external;

  function harvestAllRewards(address to) external;
}
