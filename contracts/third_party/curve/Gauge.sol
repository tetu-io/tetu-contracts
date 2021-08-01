//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface Gauge {
    function deposit(uint) external;
    function balanceOf(address) external view returns (uint);
    function claimable_reward(address _addr, address _token) external view returns (uint256);
    function claimed_reward(address _addr, address _token) external view returns (uint256);
    function claimable_reward_write(address _addr, address _token) external returns (uint256);
    function withdraw(uint, bool) external;
    function claim_rewards() external;
}

interface VotingEscrow {
    function create_lock(uint256 v, uint256 time) external;
    function increase_amount(uint256 _value) external;
    function increase_unlock_time(uint256 _unlock_time) external;
    function withdraw() external;
}

interface Mintr {
    function mint(address) external;
}
