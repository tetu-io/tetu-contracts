// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.8.4;

interface IAlpacaVault {
  function deposit(uint256 amountToken) external payable;
  function withdraw(uint256 share) external;
}