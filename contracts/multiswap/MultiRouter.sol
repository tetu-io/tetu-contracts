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

import "../third_party/uniswap/IUniswapV2Factory.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/IERC20Name.sol";
import "../swap/libraries/Math.sol";

import "hardhat/console.sol"; // TODO remove

/// @title MultiRouter
/// @dev Multi Swap
/// @author bogdoslav
contract MultiRouter /*is IMultiRouter*/ { // TODO interface

  struct LpData {
    address lp;
    address token0;
    address token1;
  }

  struct ReservesData {
    uint256 reserve0;
    uint256 reserve1;
  }

  struct TokenData {
    address token;
    string symbol;
  }

  function loadPairsUniswapV2(address factoryAddress, uint256 skip, uint256 count )
  external view returns (LpData[] memory pairs) {
    console.log('loadPairsUniswapV2');
    IUniswapV2Factory factory = IUniswapV2Factory(factoryAddress);
    uint256 allPairsLength = factory.allPairsLength();
    uint256 maxPair = Math.min(allPairsLength, skip + count);
    pairs = new LpData[](maxPair - skip);

    uint256 b = 0;
    for (uint p = skip; p < maxPair; p++) {
      address pairAddress = factory.allPairs(p);
      console.log('pairAddress', pairAddress);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      address token0 = pair.token0();
      address token1 = pair.token1();

      pairs[b++] = LpData({lp:pairAddress, token0:token0, token1: token1});
    }
  }

  function loadPairReserves(address[] memory pairs)
  external view returns (ReservesData[] memory data) {
    uint256 len = pairs.length;
    data = new ReservesData[](len);

    for (uint i = 0; i < len; i++) {
      address pairAddress = pairs[i];
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
//      (uint256 r0, uint256 r1,) = pair.getReserves();
//      data[i] = ReservesData{reserve0:r0, reserve1:r1});
      try pair.getReserves() returns (uint112 reserve0, uint112 reserve1, uint32) {
        data[i] = ReservesData({reserve0:reserve0, reserve1:reserve1});
      } catch (bytes memory) { // any error interpret as nil reserves
        data[i] = ReservesData({reserve0:0, reserve1:0});
      }
    }
  }

  function loadTokenNames(address[] memory tokens)
  external view returns (TokenData[] memory data) {
    uint256 len = tokens.length;
    data = new TokenData[](len);

    for (uint i = 0; i < len; i++) {
      address tokenAddress = tokens[i];
      IERC20Name tokenName = IERC20Name(tokenAddress);
      string memory symbol = tokenName.symbol();
      data[i] = TokenData({token:tokenAddress, symbol: symbol});
    }
  }

}
