// SPDX-License-Identifier: UNLICENSED
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

/// @title MultiRouter
/// @dev Multi Swap Router
contract MultiRouter /*is IMultiRouter*/ { // TODO interface

  enum PoolType {
    Uniswap2,
    Tetuswap
  }

  struct Step {
    address pool;
    uint256 amount0Out;
    uint256 amount1Out;
    PoolType poolType;
  }

  struct Pool {
    address adr;
    uint256 reserveA;
    uint256 reserveB;
    PoolType poolType;
  }

  function findBestPaths(address tokenIn, address tokenOut, uint256 amountIn)
  public view returns (Step[]) {
    Step[] memory steps;


    return steps;
  }
}
