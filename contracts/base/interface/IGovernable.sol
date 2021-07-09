//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

interface IGovernable {

  function isGovernance(address _contract) external view returns (bool);
}
