//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/proxy/UpgradeableProxy.sol";
import "../interface/IUpgradeSource.sol";


contract VaultProxy is UpgradeableProxy {

  constructor(address _logic) UpgradeableProxy(_logic, "") {
    _upgradeTo(_logic);
  }

  /**
  * The main logic. If the timer has elapsed and there is a schedule upgrade,
  * the governance can upgrade the vault
  */
  function upgrade() external {
    (bool should, address newImplementation) = IUpgradeSource(address(this)).shouldUpgrade();
    require(should, "Upgrade not scheduled");
    _upgradeTo(newImplementation);

    // the finalization needs to be executed on itself to update the storage of this proxy
    // it also needs to be invoked by the governance, not by address(this), so delegatecall is needed
    (bool success,) = address(this).delegatecall(
      abi.encodeWithSignature("finalizeUpgrade()")
    );

    require(success, "not success");
  }

  function implementation() external view returns (address) {
    return _implementation();
  }
}
