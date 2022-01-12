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

import "../../third_party/uniswap/IUniswapV2Factory.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";

import "hardhat/console.sol";

/// @title MultiRouter
/// @dev Multi Swap Router
contract MultiRouter /*is IMultiRouter*/ { // TODO interface

  struct LpData {
    address lp;
    address token;
    address oppositeToken;
  }

  struct Way {
    address lp;
    address tokenIn;
    address tokenOut;
    uint8 stepNumber;
  }

  enum PoolType {
    Uniswap2,
    Tetuswap
  }

  struct Step {
    address lp;
    uint256 percentage;
    PoolType poolType;
  }

/*  struct Pool {
    address adr;
    uint256 reserveA;
    uint256 reserveB;
    PoolType poolType;
  }*/

  struct Direction {
    uint32 wayIndex;
    Direction[] directions;
  }

  uint8 constant public ROUTE_LENGTH_MAX = 5;
  uint8 constant public ROUTES_MAX = 128;

 /* function isBlueChip(address token)
  private pure view returns (bool) {
    return false; // TODO
  }*/

  function loadWays(address[] memory factories )
  public view returns (Way[] memory ways) {
    uint256 factoriesLength = factories.length;
    uint256[] memory allPairsLengths = new uint256[](factoriesLength);
    uint256 totalPairsLength = 0;
    // preload lengths to calc total pairs length for array initialization
    for (uint256 f = 0; f < factoriesLength; f++) {
      uint256 allPairsLength = IUniswapV2Factory(factories[f]).allPairsLength();
      allPairsLengths[f] = allPairsLength;
      totalPairsLength += allPairsLength;
    }

    ways = new Way[](totalPairsLength);
    uint256 b = 0;
//    uint256 w = totalPairsLength;

    // load all pairs from all factories
    for (uint256 f = 0; f < factoriesLength; f++) {
      IUniswapV2Factory factory = IUniswapV2Factory(factories[f]);
      uint256 pairsLength = allPairsLengths[f];
      for (uint p = 0; p < pairsLength; p++) {
        address pairAddress = factory.allPairs(p);
        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
        address token0 = pair.token0();
        address token1 = pair.token1();

        Way memory directWay  = Way({lp:pairAddress, tokenIn:token0, tokenOut: token1, stepNumber:0});
        Way memory reverseWay = Way({lp:pairAddress, tokenIn:token1, tokenOut: token0, stepNumber:0});

//        if (isBlueChip(token0) || isBlueChip(token1)) {
          ways[b++] = directWay;
          ways[b++] = reverseWay;
       /* } else {
          ways[--w] = directWay;
          ways[--w] = reverseWay;
        }*/
      }
    }
  }

  function findAllRoutes(Way[] memory ways, address tokenIn, address tokenOut, uint8 maxRoutes, uint8 maxRouteLength)
  public view returns (uint32[][] memory _routes) {
    bool[] memory finished = new bool[](maxRoutes);
    uint32[][] memory routes = new uint32[][](maxRoutes);

    for (uint8 r = 0; r < maxRoutes; r++) {
      routes[r]  = new uint32[](maxRouteLength);
    }

    uint8 routesCount = 0;
    uint8 finishedRoutes = 0;

    // first step - we fill ways with tokenIn
    for (uint8 w = 0; w < ways.length; w++) {
      Way memory way = ways[w];
      if (way.tokenIn == tokenIn) {
        way.stepNumber = 1;
        routes[routesCount][0] = w;
        if (way.tokenOut == tokenOut) {
          finished[routesCount] = true;
          finishedRoutes++;
        }
        routesCount++;
      }
    }

    {
    for (uint8 s = 1; s < maxRouteLength; s++) {
      for (uint8 r = 0; r < routesCount; r++) {
        if (finished[r]) continue;

        address lastWayTokenOut = ways[routes[r][s]].tokenOut;

        uint8 directions = 0; // directions from last way
        for (uint8 w = 0; w < ways.length; w++) {
          Way memory newWay = ways[w];
          if (newWay.stepNumber != 0) continue; // skip passed ways
          if (lastWayTokenOut == newWay.tokenIn) {
            newWay.stepNumber = s + 1;
            uint32 routeIndex = r;
            bool routeFinished = newWay.tokenOut == tokenOut;

            if (directions != 0) {
              if (routesCount>=maxRoutes) continue;
              // copy current route
              for (uint8 i = 0; i < s; i++) {
                routes[routesCount][i] = routes[r][i];
              }
              routeIndex = routesCount;
              routesCount++;
            }

            routes[routeIndex][s + 1] = w;
            finished[routeIndex] = routeFinished;
            if (routeFinished) finishedRoutes++;
            directions++;
          }
        }
      }
    }
    }

    // copy finished routes to _routes return variable
    _routes = new uint32[][](finishedRoutes);
    uint8 f = 0;
    for (uint8 r = 0; r < routesCount; r++) {
      if (finished[r]) _routes[f++] = routes[r];
    }
  }

  function findBestRoutes(address[] memory factories, address tokenIn, address tokenOut, uint8 maxRoutes, uint8 maxRouteLength)
  external view returns (Step[][] memory multiRoute) {
    uint8 _maxRoutes = maxRoutes != 0 ? maxRoutes : ROUTES_MAX;
    uint8 _maxRouteLength = maxRouteLength != 0 ? maxRouteLength : ROUTE_LENGTH_MAX;
    Way[] memory ways = loadWays(factories);
    uint32[][] memory routes = findAllRoutes(ways, tokenIn, tokenOut, _maxRoutes, _maxRouteLength);
  }
}
