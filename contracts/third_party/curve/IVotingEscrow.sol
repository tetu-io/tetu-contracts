//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

interface IVotingEscrow {

  function balanceOf(address addr) external view returns (uint);

  function balanceOfAt(address addr, uint block_) external view returns (uint);

  function totalSupply() external view returns (uint);

  function totalSupplyAt(uint block_) external view returns (uint);

  function locked(address user) external view returns (uint amount, uint end);

  function create_lock(uint value, uint unlock_time) external;

  function increase_amount(uint value) external;

  function increase_unlock_time(uint unlock_time) external;

  function withdraw() external;

  function commit_smart_wallet_checker(address addr) external;

  function apply_smart_wallet_checker() external;

}
