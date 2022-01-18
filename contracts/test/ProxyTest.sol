pragma solidity 0.8.4;

import "../base/governance/Controllable.sol";

contract ProxyTest {
  function isController(address) external returns (bool){
    return false;
  }
}
