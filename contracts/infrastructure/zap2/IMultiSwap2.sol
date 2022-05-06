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

import "../../third_party/balancer/IBVault.sol";

/// @title Multi Swap 2 Interface
/// @dev Interface to do multiple swaps, based on routes with weights
/// @author bogdoslav
interface IMultiSwap2 {

  struct Step {
    address lp;
    bool reverse;
  }

  function multiSwap(
    address tokenIn,
    address tokenOut,
    uint amount,
    uint slippageTolerance,
    bytes memory routesData
  ) external;

  function multiSwap(
    address tokenIn,
    address tokenOut,
    uint amount,
    IBVault.BatchSwapStep[] memory swaps,
    IAsset[] memory assets,
    uint minAmountOut,
    uint256 deadline
  ) external returns (uint amountOut);

}
