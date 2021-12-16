// SPDX-License-Identifier: ISC
pragma solidity 0.8.4;

interface IEternalPool {

  event Withdraw(address indexed user, uint256 amount);
  event Deposit(address indexed user, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 amount);

  struct UserInfo
  {
    uint256 amount;                     // How many DINO tokens the user has provided.
    uint256 rewardDebt;                 // Reward debt. See explanation below.
  }

  struct PoolInfo
  {
    uint256 lastRewardBlock;            // Last block number that reward distribution occured.
    uint256 accRewardPerShare;          // Accumulated reward per share, times 1e12. See below.
  }

  // Dino token.
  function DINO() external view returns (address);

  // Reward token.
  function REWARD() external view returns (address);

  // Reward tokens created per block.
  function rewardPerBlock() external view returns (uint);

  // The block number at which reward distribution starts.
  function startBlock() external view returns (uint);

  // The block number at which reward distribution ends.
  function endBlock() external view returns (uint);

  // Total Dino tokens staked in the contract.
  function stakedDinos() external view returns (uint);

  function poolInfo() external view returns (PoolInfo memory);

  // Info of each user that stakes DINO tokens.
  function userInfo(address _user) external view returns (UserInfo memory);

  /**
   * @dev View function to see pending rewards on frontend.
   * @param _user Address of a specific user.
   * @return Pending rewards.
   */
  function pendingReward(address _user) external view returns (uint256);

  /**
   * @dev Update reward variables of the given pool to be up-to-date.
   */
  function updatePool() external;

  /**
   * @dev Deposit Dino tokens to the Eternal Pool for reward allocation.
   * @param _amount Amount of LP tokens to deposit.
   */
  function deposit(uint256 _amount) external;

  /**
   * @dev Withdraw Dino tokens from the Eternal Pool.
   * @param _amount Amount of LP tokens to withdraw.
   */
  function withdraw(uint256 _amount) external;


  /**
   * @dev Withdraw without caring about rewards. EMERGENCY ONLY.
   */
  function emergencyWithdraw() external;

  /**
   * @dev Transfer reward tokens. EMERGENCY ONLY.
   * @return Success.
   */
  function emergencyTransfer(address _to) external returns (bool);

  /**
   * @dev Define last block on which reward distribution occurs.
   * @return Last block number.
   */
  function setEndBlock(uint256 _endBlock) external returns (uint256);

  /**
   * @dev Update rewards per block.
   * @return Reward per block.
   */
  function setDinoPerBlock(uint256 _rewardPerBLock) external returns (uint256);

}
