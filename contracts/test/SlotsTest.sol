// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;

import "../base/governance/ControllableV2.sol";

contract SlotsTest is ControllableV2 {
  struct SomeStruct {
    uint a;
    uint b;
  }

  mapping (uint => SomeStruct) public map;

  function initialize(address controller_) external initializer {
    initializeControllable(controller_);
  }

  function setMapA(uint index, uint a) external {
    map[index].a = a;
  }

}


/// @dev extending SomeStruct with new member
contract SlotsTest2 is ControllableV2 {
  struct SomeStruct {
    uint a;
    uint b;
  }

  mapping (uint => SomeStruct) public map;

  function initialize(address controller_) external initializer {
    initializeControllable(controller_);
  }

  function setMapA(uint index, uint a) external {
    map[index].a = a;
  }

  function setMapB(uint index, uint b) external {
    map[index].b = b;
  }

}
