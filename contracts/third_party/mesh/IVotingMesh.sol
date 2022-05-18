// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;

interface IVotingMesh {
  function mining() external view returns (uint256);

  function balanceOf(address) external view returns (uint256);

  function lockedMESH(address) external view returns (uint256);

  function lockPeriod(address) external view returns (uint256);

  function snapShotBalance(address, uint256) external view returns (uint256);

  function snapShotCount(address) external view returns (uint256);

  function getUserUnlockTime(address user) external view returns (uint256);

  function getCurrentBalance(address user) external view returns (uint256);

  function getPriorBalance(address user, uint256 blockNumber) external view returns (uint256);

  function refixBoosting(uint256 lockPeriodRequested) external;

  function lockMESH(uint256 amount, uint256 lockPeriodRequested) external;

  function unlockMESH() external;

  function unlockMESHUnlimited() external;

  function claimReward() external;

  function compoundReward() external;
}
