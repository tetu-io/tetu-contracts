// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface ITShareRewardPool {

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. tSHAREs to distribute per block.
        uint256 lastRewardTime; // Last time that tSHAREs distribution occurs.
        uint256 accTSharePerShare; // Accumulated tSHAREs per share, times 1e18. See below.
        bool isStarted; // if lastRewardTime has passed
    }

    function deposit(uint256 _pid, uint256 _amount) external;

    function withdraw(uint256 _pid, uint256 _amount) external;

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) external;

    function pendingShare(uint256 _pid, address _user) external view returns (uint256);

    // Info of each pool.
    function poolInfo(uint256 _pid) external view returns (PoolInfo memory);

    // Info of each user that stakes LP tokens.
    function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);

}
