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

import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/IERC20Extended.sol";

/// @title Library with useful functions for Uniswap like pair contracts
/// @author belbix
library UniPairLib{

  uint256 private constant _PRECISION = 1e18;

  /// @dev Return price of given token based on given pair reserves
  /// @return Normalized to 18 decimals token price
  function getPrice(address _pair, address _token) internal view returns (uint256) {
    IUniswapV2Pair pair = IUniswapV2Pair(_pair);
    address token0 = pair.token0();
    address token1 = pair.token1();
    (uint256 reserve0, uint256 reserve1,) = pair.getReserves();
    uint256 token0Decimals = IERC20Extended(token0).decimals();
    uint256 token1Decimals = IERC20Extended(token1).decimals();

    // both reserves should have the same decimals
    reserve0 = reserve0 * _PRECISION / (10 ** token0Decimals);
    reserve1 = reserve1 * _PRECISION / (10 ** token1Decimals);

    if (_token == token0) {
      return reserve1 * _PRECISION / reserve0;
    } else if (_token == token1) {
      return reserve0 * _PRECISION / reserve1;
    } else {
      revert("SFS: token not in lp");
    }
  }

}
