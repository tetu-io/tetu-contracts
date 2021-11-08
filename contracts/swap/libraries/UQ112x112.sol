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

/// @title Uniswap UQ112x112 solution https://github.com/Uniswap/v2-core/blob/master/contracts/libraries/UQ112x112.sol
///        A library for handling binary fixed point numbers (https://en.wikipedia.org/wiki/Q_(number_format))
/// @dev range: [0, 2**112 - 1]
///      resolution: 1 / 2**112
library UQ112x112 {
  uint224 constant Q112 = 2 ** 112;

  /// @dev Encode a uint112 as a UQ112x112
  function encode(uint112 y) internal pure returns (uint224 z) {
    z = uint224(y) * Q112;
    // never overflows
  }

  /// @dev Divide a UQ112x112 by a uint112, returning a UQ112x112
  function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z) {
    z = x / uint224(y);
  }
}
