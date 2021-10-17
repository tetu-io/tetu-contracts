// SPDX-License-Identifier: ISC
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

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/ITetuSwapPair.sol";

/// @title UniswapV2Library https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol
library TetuSwapLibrary {
  using SafeMath for uint;

  uint constant private _PRECISION = 10000;
  uint constant private _FEE = 2;

  // returns sorted token addresses, used to handle return values from pairs sorted in this order
  function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    require(tokenA != tokenB, "TSL: IDENTICAL_ADDRESSES");
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0), "TSL: ZERO_ADDRESS");
  }

  // calculates the CREATE2 address for a pair without making any external calls
  function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
    (address token0, address token1) = sortTokens(tokenA, tokenB);
    pair = address(uint160(uint(keccak256(abi.encodePacked(
        hex"ff",
        factory,
        keccak256(abi.encodePacked(token0, token1)),
        hex"99c449cea8fe7e3359cf07b306292054e5402de6d068fd40c34c0081fa1cde8e" // init code hash
      )))));
  }

  // fetches and sorts the reserves for a pair
  function getReserves(address factory, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB) {
    (address token0,) = sortTokens(tokenA, tokenB);
    (uint reserve0, uint reserve1,) = ITetuSwapPair(pairFor(factory, tokenA, tokenB)).getReserves();
    (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
  }

  // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
  function quote(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
    require(amountA > 0, "TSL: INSUFFICIENT_AMOUNT");
    require(reserveA > 0 && reserveB > 0, "TSL: INSUFFICIENT_LIQUIDITY");
    amountB = amountA.mul(reserveB) / reserveA;
  }

  // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint fee) internal pure returns (uint amountOut) {
    require(amountIn > 0, "TSL: INSUFFICIENT_INPUT_AMOUNT");
    require(reserveIn > 0 && reserveOut > 0, "TSL: INSUFFICIENT_LIQUIDITY");
    uint amountInWithFee = amountIn.mul(_PRECISION - fee);
    uint numerator = amountInWithFee.mul(reserveOut);
    uint denominator = reserveIn.mul(_PRECISION).add(amountInWithFee);
    amountOut = numerator / denominator;
  }

  // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
  function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut, uint fee) internal pure returns (uint amountIn) {
    require(amountOut > 0, "TSL: INSUFFICIENT_OUTPUT_AMOUNT");
    require(reserveIn > 0 && reserveOut > 0, "TSL: INSUFFICIENT_LIQUIDITY");
    uint numerator = reserveIn.mul(amountOut).mul(_PRECISION);
    uint denominator = reserveOut.sub(amountOut).mul(_PRECISION - fee);
    amountIn = (numerator / denominator).add(1);
  }

  // performs chained getAmountOut calculations on any number of pairs
  function getAmountsOut(address factory, uint amountIn, address[] memory path) internal view returns (uint[] memory amounts) {
    require(path.length >= 2, "TSL: INVALID_PATH");
    amounts = new uint[](path.length);
    amounts[0] = amountIn;
    for (uint i; i < path.length - 1; i++) {
      (uint reserveIn, uint reserveOut) = getReserves(factory, path[i], path[i + 1]);
      amounts[i + 1] = getAmountOut(
        amounts[i],
        reserveIn,
        reserveOut,
        ITetuSwapPair(pairFor(factory, path[i], path[i + 1])).fee()
      );
    }
  }

  // performs chained getAmountIn calculations on any number of pairs
  function getAmountsIn(address factory, uint amountOut, address[] memory path) internal view returns (uint[] memory amounts) {
    require(path.length >= 2, "TSL: INVALID_PATH");
    amounts = new uint[](path.length);
    amounts[amounts.length - 1] = amountOut;
    for (uint i = path.length - 1; i > 0; i--) {
      (uint reserveIn, uint reserveOut) = getReserves(factory, path[i - 1], path[i]);
      amounts[i - 1] = getAmountIn(
        amounts[i],
        reserveIn,
        reserveOut,
        ITetuSwapPair(pairFor(factory, path[i - 1], path[i])).fee()
      );
    }
  }
}
