// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;

contract ControllerMinimal {

  address public governance;

  constructor (address governance_) {
    governance = governance_;
  }

}
