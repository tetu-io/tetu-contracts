// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface ICosmicMasterChef {

  // Info of each user.
  struct UserInfo {
    uint256 amount;         // How many LP tokens the user has provided.
    uint256 rewardDebt;     // Reward debt. See explanation below.
    //
    // We do some fancy math here. Basically, any point in time, the amount of COSMICs
    // entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accCosmicPerShare) - user.rewardDebt
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accCosmicPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardDebt` gets updated.
  }

  // Info of each pool.
  struct PoolInfo {
    address lpToken;           // Address of LP token contract.
    uint256 allocPoint;       // How many allocation points assigned to this pool. COSMICs to distribute per block.
    uint256 lastRewardBlock;  // Last block number that COSMICs distribution occurs.
    uint256 accCosmicPerShare;   // Accumulated COSMICs per share, times 1e12. See below.
    uint16 depositFeeBP;      // Deposit fee in basis points
  }

  function cosmic() external view returns (address);

  function devAddress() external view returns (address);

  function feeAddress() external view returns (address);

  function cosmicPerBlock() external view returns (uint256);

  function BONUS_MULTIPLIER() external view returns (uint256);

  function INITIAL_EMISSION_RATE() external view returns (uint256);

  function MINIMUM_EMISSION_RATE() external view returns (uint256);

  function EMISSION_REDUCTION_PERIOD_BLOCKS() external view returns (uint256);

  function EMISSION_REDUCTION_RATE_PER_PERIOD() external view returns (uint256);

  function lastReductionPeriodIndex() external view returns (uint256);

  function poolInfo(uint256 _pid) external view returns (PoolInfo memory);

  function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);

  function totalAllocPoint() external view returns (uint256);

  function startBlock() external view returns (uint256);

  function cosmicReferral() external view returns (address);

  function referralCommissionRate() external view returns (uint256);

  function MAXIMUM_REFERRAL_COMMISSION_RATE() external view returns (uint256);

  function poolLength() external view returns (uint256);

  function pendingCosmic(uint256 _pid, address _user) external view returns (uint256);

  function deposit(uint256 _pid, uint256 _amount, address _referrer) external;

  function withdraw(uint256 _pid, uint256 _amount) external;

  function emergencyWithdraw(uint256 _pid) external;
}
