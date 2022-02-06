// SPDX-License-Identifier: agpl-3.0

pragma solidity ^0.8.4;

interface IeQi {

  struct UserInfo {
    uint256 amount;
    uint256 endBlock;
  }

  function userInfo(address user) external view returns (UserInfo memory);

  function enter(uint256 _amount, uint256 _blockNumber) external;

  function leave() external;

  function underlyingBalance(address user) external view returns (uint256);

  function emergencyExit() external;

}
