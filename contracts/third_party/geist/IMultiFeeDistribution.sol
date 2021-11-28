// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IMultiFeeDistribution {

  function exit() external;

  function mint(address user, uint256 amount, bool withPenalty) external;

}
