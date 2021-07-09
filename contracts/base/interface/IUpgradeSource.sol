//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

interface IUpgradeSource {

  function finalizeUpgrade() external;

  function shouldUpgrade() external view returns (bool, address);

}
