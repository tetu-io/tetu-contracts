// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface IReferral {
  /**
   * @dev Record referral.
   */
  function recordReferral(address user, address referrer) external;

  /**
   * @dev Get the referrer address that referred the user.
   */
  function getReferrer(address user) external view returns (address);
}

interface IIrisMasterChef {
  // Info of each user.
  struct UserInfo {
    uint256 amount;         // How many LP tokens the user has provided.
    uint256 rewardDebt;     // Reward debt. See explanation below.
    //
    // We do some fancy math here. Basically, any point in time, the amount of IRIS
    // entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accIrisPerShare) - user.rewardDebt
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accIrisPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardDebt` gets updated.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken;           // Address of LP token contract.
    uint256 allocPoint;       // How many allocation points assigned to this pool. IRISes to distribute per block.
    uint256 lastRewardBlock;  // Last block number that IRISes distribution occurs.
    uint256 accIrisPerShare;   // Accumulated IRISes per share, times 1e18. See below.
    uint16 depositFeeBP;      // Deposit fee in basis points
    uint256 lpSupply;
  }

  // The IRIS TOKEN!
  //    IrisToken public iris;
  //    address public devAddress;
  //    address public feeAddress;
  //    uint256 constant max_iris_supply = 1000000 ether;

  // IRIS tokens created per block.
  //    uint256 public irisPerBlock = 0.4 ether;

  // Info of each pool.
  //    PoolInfo[] public poolInfo;
  function poolInfo(uint256 _pid)
  external view returns (
    IERC20 lpToken,
    uint256 allocPoint,
    uint256 lastRewardBlock,
    uint256 accIrisPerShare,
    uint16 depositFeeBP,
    uint256 lpSupply
  );
  // IRIS tokens created per block.
  function irisPerBlock() external view returns (uint256);
  // The block number at which IRIS distribution starts.
  function startBlock() external view returns (uint256);
  // The block number at which IRIS distribution ends.
  function endBlock() external view returns (uint256);

  function totalAllocPoint() external view returns (uint256); // Total allocation points. Must be the sum of all allocation points in all pools.

  // Info of each user that stakes LP tokens.
  function userInfo(uint256 _pid, address _user)
  external view returns (
    uint256 amount,
    uint256 rewardDebt
  );


  // Iris referral contract address.
  //    IReferral public referral;
  // Referral commission rate in basis points.
  //    uint16 public referralCommissionRate = 200;
  // Max referral commission rate: 5%.
  //    uint16 public constant MAXIMUM_REFERRAL_COMMISSION_RATE = 500;
  //    uint256 public constant MAXIMUM_EMISSION_RATE = 1 ether;

  function poolLength() external view returns (uint256);

  // Add a new lp to the pool. Can only be called by the owner.
  function add(uint256 _allocPoint, address _lpToken, uint16 _depositFeeBP) external;

  // Update the given pool's IRIS allocation point and deposit fee. Can only be called by the owner.
  function set(uint256 _pid, uint256 _allocPoint, uint16 _depositFeeBP) external;

  // Return reward multiplier over the given _from to _to block.
  function getMultiplier(uint256 _from, uint256 _to) external view returns (uint256);

  // View function to see pending IRISes on frontend.
  function pendingIris(uint256 _pid, address _user) external view returns (uint256);

  // Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() external;

  // Update reward variables of the given pool to be up-to-date.
  function updatePool(uint256 _pid) external;

  // Deposit LP tokens to MasterChef for IRIS allocation.
  function deposit(uint256 _pid, uint256 _amount, address _referrer) external;

  // Withdraw LP tokens from MasterChef.
  function withdraw(uint256 _pid, uint256 _amount) external;

  // Withdraw without caring about rewards. EMERGENCY ONLY.
  function emergencyWithdraw(uint256 _pid) external;

  // Update dev address by the previous dev.
  function setDevAddress(address _devAddress) external;

  function setFeeAddress(address _feeAddress) external;

  function updateEmissionRate(uint256 _irisPerBlock) external;

  // Update the referral contract address by the owner
  function setReferralAddress(IReferral _referral) external;

  // Update referral commission rate by the owner
  function setReferralCommissionRate(uint16 _referralCommissionRate) external;

  // Only update before start of farm
  function updateStartBlock(uint256 _startBlock) external;
}
