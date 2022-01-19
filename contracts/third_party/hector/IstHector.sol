// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IstHector {

  function rebase(uint256 profit_, uint epoch_) external returns (uint256);

}
