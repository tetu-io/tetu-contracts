// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IFireBirdFormula {

  function getReserveAndWeights(address pair, address tokenA) external view returns (
    address tokenB,
    uint reserveA,
    uint reserveB,
    uint32 tokenWeightA,
    uint32 tokenWeightB,
    uint32 swapFee
  );

  function getFactoryReserveAndWeights(address factory, address pair, address tokenA) external view returns (
    address tokenB,
    uint reserveA,
    uint reserveB,
    uint32 tokenWeightA,
    uint32 tokenWeightB,
    uint32 swapFee
  );

  function getAmountIn(
    uint amountOut,
    uint reserveIn, uint reserveOut,
    uint32 tokenWeightIn, uint32 tokenWeightOut,
    uint32 swapFee
  ) external view returns (uint amountIn);

  function getPairAmountIn(address pair, address tokenIn, uint amountOut) external view returns (uint amountIn);

  function getAmountOut(
    uint amountIn,
    uint reserveIn, uint reserveOut,
    uint32 tokenWeightIn, uint32 tokenWeightOut,
    uint32 swapFee
  ) external view returns (uint amountOut);

  function getPairAmountOut(address pair, address tokenIn, uint amountIn) external view returns (uint amountOut);

  function getAmountsIn(
    address tokenIn,
    address tokenOut,
    uint amountOut,
    address[] calldata path
  ) external view returns (uint[] memory amounts);

  function getFactoryAmountsIn(
    address factory,
    address tokenIn,
    address tokenOut,
    uint amountOut,
    address[] calldata path
  ) external view returns (uint[] memory amounts);

  function getAmountsOut(
    address tokenIn,
    address tokenOut,
    uint amountIn,
    address[] calldata path
  ) external view returns (uint[] memory amounts);

  function getFactoryAmountsOut(
    address factory,
    address tokenIn,
    address tokenOut,
    uint amountIn,
    address[] calldata path
  ) external view returns (uint[] memory amounts);

  function ensureConstantValue(uint reserve0, uint reserve1, uint balance0Adjusted, uint balance1Adjusted, uint32 tokenWeight0) external view returns (bool);
  function getReserves(address pair, address tokenA, address tokenB) external view returns (uint reserveA, uint reserveB);
  function getOtherToken(address pair, address tokenA) external view returns (address tokenB);
  function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB);
  function sortTokens(address tokenA, address tokenB) external pure returns (address token0, address token1);
  function mintLiquidityFee(
    uint totalLiquidity,
    uint112 reserve0,
    uint112  reserve1,
    uint32 tokenWeight0,
    uint32 tokenWeight1,
    uint112  collectedFee0,
    uint112 collectedFee1) external view returns (uint amount);
}
