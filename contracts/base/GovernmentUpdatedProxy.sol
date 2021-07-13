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
