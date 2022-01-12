// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;
import "../base/UniPairLib.sol";

contract UniPairLibTest {
  using UniPairLib for address;

  function getTokenPrice(address _pair, address _token) public view returns (uint256) {
    return _pair.getPrice(_token);
  }

}
