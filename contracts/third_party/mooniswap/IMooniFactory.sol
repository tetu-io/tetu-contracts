// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IMooniFactory {
  function isPool(address token) external view returns(bool);
  function getAllPools() external view returns(address[] memory);
  function pools(address tokenA, address tokenB) external view returns(address);
}
