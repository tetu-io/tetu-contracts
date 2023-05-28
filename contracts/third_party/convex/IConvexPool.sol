//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

interface IConvexPool {

  function coins(uint256 i) external view returns (address);

  function balances(uint256 i) external view returns (uint256);

  function get_balances() external view returns (uint[2] memory);

}