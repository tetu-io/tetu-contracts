// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";


interface ICafeMasterChef {
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
    //
    // We do some fancy math here. Basically, any point in time, the amount of BREWs
    // entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accBrewPerShare) - user.rewardDebt
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accBrewPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardDebt` gets updated.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. BREWs to distribute per block.
    uint256 lastRewardBlock; // Last block number that BREWs distribution occurs.
    uint256 accBrewPerShare; // Accumulated BREWs per share, times 1e12. See below.
    uint16 depositFeeBP; // Deposit fee in basis points
  }

  // The BREW TOKEN!
  function brew() external view returns (address);
  // Dev address.
  function devaddr() external view returns (address);
  // BREW tokens created per block.
  function brewPerBlock() external view returns (uint256);
  // Deposit Fee address
  function feeAddress() external view returns (address);

  // Info of each pool.
  function poolInfo(uint256 _pid) external view returns (PoolInfo memory);
  // Info of each user that stakes LP tokens.
  function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);
  // Info if a pool exists or not
  function poolExistence(address _erc20) external view returns (bool);
  // Total allocation points. Must be the sum of all allocation points in all pools.
  function totalAllocPoint() external view returns (uint256);
  // The block number when BREW mining starts.
  function startBlock() external view returns (uint256);

  // cafeSwapTransfer helper to be able to stake brew tokens
  function cafeSwapTransfer() external view returns (address);


  function poolLength() external view returns (uint256);

  // Add a new lp to the pool. Can only be called by the owner.
  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    uint16 _depositFeeBP,
    bool _withUpdate
  ) external;

  // Update the given pool's BREW allocation point and deposit fee. Can only be called by the owner.
  function set(
    uint256 _pid,
    uint256 _allocPoint,
    uint16 _depositFeeBP,
    bool _withUpdate
  ) external;

  // Return reward multiplier over the given _from to _to block.
  function getMultiplier(uint256 _from, uint256 _to) external pure returns (uint256);

  // View function to see pending BREWs on frontend.
  function pendingBrew(uint256 _pid, address _user)
  external
  view
  returns (uint256);

  // Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() external;

  // Update reward variables of the given pool to be up-to-date.
  function updatePool(uint256 _pid) external;

  // Deposit LP tokens to MasterChef for BREW allocation.
  function deposit(uint256 _pid, uint256 _amount) external;

  // Withdraw LP tokens from MasterChef.
  function withdraw(uint256 _pid, uint256 _amount) external;

  // Withdraw without caring about rewards. EMERGENCY ONLY.
  function emergencyWithdraw(uint256 _pid) external;

  // Update dev address by the previous dev.
  function dev(address _devaddr) external;

  function setFeeAddress(address _feeAddress) external;

  //Pancake has to add hidden dummy pools inorder to alter the emission, here we make it simple and transparent to all.
  function updateEmissionRate(uint256 _brewPerBlock) external;
}
