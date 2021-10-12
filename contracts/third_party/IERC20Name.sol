// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IERC20Name {
  function name() external view returns (string memory);

  function symbol() external view returns (string memory);
}
