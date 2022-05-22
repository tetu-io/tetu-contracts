pragma solidity 0.8.4;

interface ICreatePool {
  function createETHPool(
    address token,
    uint256 amount,
    uint256 fee
  ) external payable;

  function createTokenPool(
    address token0,
    uint256 amount0,
    address token1,
    uint256 amount1,
    uint256 fee
  ) external;
}