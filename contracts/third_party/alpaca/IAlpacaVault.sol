// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.8.4;

interface IAlpacaVault {
  function token() external view returns(address);
  function totalToken() external view returns(uint256);
  function totalSupply() external view returns(uint256);
  function deposit(uint256 amountToken) external payable;
  function withdraw(uint256 share) external;
}