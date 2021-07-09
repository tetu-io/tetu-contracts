//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRewarder {
  function onSushiReward(uint256 pid, address user, address recipient, uint256 sushiAmount, uint256 newLpAmount) external;

  function pendingTokens(uint256 pid, address user, uint256 sushiAmount) external view returns (IERC20[] memory, uint256[] memory);

  function pendingToken(uint256 _pid, address _user) external view returns (uint256 pending);

  function rewardPerSecond() external view returns (uint256);

  function userInfo(uint256 _pid, address _user)
  external view returns (uint256 amount, uint256 rewardDebt);

  function poolInfo(uint256 _pid)
  external view returns (uint256 accSushiPerShare, uint256 lastRewardBlock, uint256 allocPoint);
}
