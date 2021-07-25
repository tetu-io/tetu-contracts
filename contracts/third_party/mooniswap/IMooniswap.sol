// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IMooniswap {
  function getBalanceForRemoval(address token) external view returns(uint256);
  function token0() external view returns(address);
  function token1() external view returns(address);
  function totalSupply() external view returns(uint256);
}
