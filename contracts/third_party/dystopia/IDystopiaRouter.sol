// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IDystopiaRouter {
  struct Route {
    address from;
    address to;
    bool stable;
  }

  function factory() external view returns (address);

  function WMATIC() external view returns (address);

  function addLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint amountADesired,
    uint amountBDesired,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
  ) external returns (uint amountA, uint amountB, uint liquidity);

  function addLiquidityMATIC(
    address token,
    bool stable,
    uint amountTokenDesired,
    uint amountTokenMin,
    uint amountMATICMin,
    address to,
    uint deadline
  ) external payable returns (uint amountToken, uint amountMATIC, uint liquidity);

  function removeLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint liquidity,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
  ) external returns (uint amountA, uint amountB);

  function removeLiquidityMATIC(
    address token,
    bool stable,
    uint liquidity,
    uint amountTokenMin,
    uint amountMATICMin,
    address to,
    uint deadline
  ) external returns (uint amountToken, uint amountMATIC);

  function removeLiquidityWithPermit(
    address tokenA,
    address tokenB,
    bool stable,
    uint liquidity,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline,
    bool approveMax, uint8 v, bytes32 r, bytes32 s
  ) external returns (uint amountA, uint amountB);

  function removeLiquidityMATICWithPermit(
    address token,
    bool stable,
    uint liquidity,
    uint amountTokenMin,
    uint amountMATICMin,
    address to,
    uint deadline,
    bool approveMax, uint8 v, bytes32 r, bytes32 s
  ) external returns (uint amountToken, uint amountMATIC);

  function swapExactTokensForTokens(
    uint amountIn,
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);

  function swapTokensForExactTokens(
    uint amountOut,
    uint amountInMax,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);

  function swapExactMATICForTokens(
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external payable returns (uint[] memory amounts);

  function swapTokensForExactMATIC(
    uint amountOut,
    uint amountInMax,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);

  function swapExactTokensForMATIC(
    uint amountIn,
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);

  function swapMATICForExactTokens(
    uint amountOut,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external payable returns (uint[] memory amounts);

  function quoteRemoveLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint liquidity
  ) external view returns (uint amountA, uint amountB);

  function quoteAddLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint amountADesired,
    uint amountBDesired
  )
  external
  view
  returns (
    uint amountA,
    uint amountB,
    uint liquidity
  );

  function pairFor(
    address tokenA,
    address tokenB,
    bool stable
  ) external view returns (address pair);

  function sortTokens(address tokenA, address tokenB)
  external
  pure
  returns (address token0, address token1);

  function quoteLiquidity(
    uint amountA,
    uint reserveA,
    uint reserveB
  ) external pure returns (uint amountB);

  function getAmountOut(
    uint amountIn,
    address tokenIn,
    address tokenOut
  ) external view returns (uint amount, bool stable);

  function getAmountIn(
    uint amountOut,
    uint reserveIn,
    uint reserveOut
  ) external pure returns (uint amountIn, bool stable);

  function getAmountsOut(uint amountIn, Route[] memory routes)
  external
  view
  returns (uint[] memory amounts);

  function getAmountsIn(uint amountOut, Route[] memory routes)
  external
  view
  returns (uint[] memory amounts);

  function getReserves(
    address tokenA,
    address tokenB,
    bool stable
  ) external view returns (uint reserveA, uint reserveB);

  function getExactAmountOut(
    uint amountIn,
    address tokenIn,
    address tokenOut,
    bool stable
  ) external view returns (uint amount);

  function isPair(address pair) external view returns (bool);

  function swapExactTokensForTokensSimple(
    uint amountIn,
    uint amountOutMin,
    address tokenFrom,
    address tokenTo,
    bool stable,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);

  function swapExactTokensForMATICSupportingFeeOnTransferTokens(
    uint amountIn,
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external;

  function swapExactMATICForTokensSupportingFeeOnTransferTokens(
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external payable;

  function swapExactTokensForTokensSupportingFeeOnTransferTokens(
    uint amountIn,
    uint amountOutMin,
    Route[] calldata routes,
    address to,
    uint deadline
  ) external;

  function removeLiquidityMATICWithPermitSupportingFeeOnTransferTokens(
    address token,
    bool stable,
    uint liquidity,
    uint amountTokenMin,
    uint amountFTMMin,
    address to,
    uint deadline,
    bool approveMax,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external returns (uint amountToken, uint amountFTM);

  function removeLiquidityMATICSupportingFeeOnTransferTokens(
    address token,
    bool stable,
    uint liquidity,
    uint amountTokenMin,
    uint amountFTMMin,
    address to,
    uint deadline
  ) external returns (uint amountToken, uint amountFTM);
}
