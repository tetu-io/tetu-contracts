//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/proxy/UpgradeableProxy.sol";
import "../base/interface/IGovernable.sol";


contract GovernmentUpdatedProxy is UpgradeableProxy {

  constructor(address _logic) UpgradeableProxy(_logic, "") {
    _upgradeTo(_logic);
  }

  function upgrade(address _newImplementation) external {
    require(IGovernable(address(this)).isGovernance(msg.sender), "forbidden");
    _upgradeTo(_newImplementation);

    // the new contract must have the same ABI and you must have the power to change it again
    require(IGovernable(address(this)).isGovernance(msg.sender), "wrong impl");
  }

  function implementation() external view returns (address) {
    return _implementation();
  }
}
