// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.6;

interface IOracleMatic {

  function getPrice(address token) external view returns (uint256);

}
