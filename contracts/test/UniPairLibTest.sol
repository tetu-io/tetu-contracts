// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;
import "../base/UniPairLib.sol";

contract UniPairLibTest {
  using UniPairLib for address;

  uint256 price;

  function getTokenPrice(address _pair, address _token) public returns (uint256) {
    price = _pair.getPrice(_token);
    return price;
  }

}