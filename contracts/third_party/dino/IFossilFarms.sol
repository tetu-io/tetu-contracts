// SPDX-License-Identifier: MIT
// Original contract: https://github.com/DinoSwap/fossil-farms-contract/blob/main/FossilFarms.sol
pragma solidity ^0.8.0;

import "../../openzeppelin/IERC20.sol";

interface IFossilFarms {

    // IERC20 public DINO;                 // DINO token

    // Info of each pool.
    function poolInfo(uint256 _pid)
    external view returns (
        IERC20 lpToken,
        uint256 allocPoint,
        uint256 lastRewardBlock,
        uint256 accDinoPerShare
    );
    // DINO tokens created per block.
    function dinoPerBlock() external view returns (uint256);
    // The block number at which DINO distribution starts.
    function startBlock() external view returns (uint256);
    // The block number at which DINO distribution ends.
    function endBlock() external view returns (uint256);

    function totalAllocPoint() external view returns (uint256); // Total allocation points. Must be the sum of all allocation points in all pools.

    // Info of each user that stakes LP tokens.
    function userInfo(uint256 _pid, address _user)
    external view returns (
        uint256 amount,
        uint256 rewardDebt
    );

    /**
     * @dev View function to see pending DINO on frontend.
     * @param _pid ID of a specific LP token pool. See index of PoolInfo[].
     * @param _user Address of a specific user.
     * @return Pending DINO.
     */
    function pendingDino(uint256 _pid, address _user) external view returns (uint256);

    /**
     * @dev Update reward variables for all pools. Be careful of gas spending!
     */
    function massUpdatePools() external;

    /**
     * @dev Update reward variables of the given pool to be up-to-date.
     * @param _pid ID of a specific LP token pool. See index of PoolInfo[].
     */
    function updatePool(uint256 _pid) external;

    /**
     * @dev Deposit LP tokens to the Fossil Farm for DINO allocation.
     * @param _pid ID of a specific LP token pool. See index of PoolInfo[].
     * @param _amount Amount of LP tokens to deposit.
     */
    function deposit(uint256 _pid, uint256 _amount) external;

    /**
     * @dev Withdraw LP tokens from the Fossil Farm.
     * @param _pid ID of a specific LP token pool. See index of PoolInfo[].
     * @param _amount Amount of LP tokens to withdraw.
     */
    function withdraw(uint256 _pid, uint256 _amount) external;

    /**
     * @dev Withdraw without caring about rewards. EMERGENCY ONLY.
     * @param _pid ID of a specific LP token pool. See index of PoolInfo[].
     */
    function emergencyWithdraw(uint256 _pid) external;

    /**
     * @dev Views total number of LP token pools.
     * @return Size of poolInfo array.
     */
    function poolLength() external view returns (uint256);

    /**
     * @dev Views total number of DINO tokens deposited for rewards.
     * @return DINO token balance of the Fossil Farm.
     */
    function balance() external view returns (uint256);

}
