// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "../base/governance/Controllable.sol";

contract ProxyTest {
  function isController(address) external pure returns (bool){
    return false;
  }
}
