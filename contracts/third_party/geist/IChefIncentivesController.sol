// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IChefIncentivesController {

  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
  }

  // Info of each pool.
  struct PoolInfo {
    uint256 totalSupply;
    uint256 allocPoint; // How many allocation points assigned to this pool.
    uint256 lastRewardTime; // Last second that reward distribution occurs.
    uint256 accRewardPerShare; // Accumulated rewards per share, times 1e12. See below.
    address onwardIncentives;
  }

  // Info about token emissions for a given time period.
  struct EmissionPoint {
    uint128 startTimeOffset;
    uint128 rewardsPerSecond;
  }

  function poolConfigurator() external view returns (address);

  function rewardMinter() external view returns (address);

  function rewardsPerSecond() external view returns (uint256);

  function maxMintableTokens() external view returns (uint256);

  function mintedTokens() external view returns (uint256);

  function registeredTokens(uint id) external view returns (address);

  function poolInfo(address _token) external view returns (PoolInfo memory);

  function emissionSchedule(uint256 id) external view returns (EmissionPoint memory);

  function userInfo(uint256 _pid, address _user) external view returns (UserInfo memory);

  function totalAllocPoint() external view returns (uint256);

  function startTime() external view returns (uint256);

  function claimReceiver(address account) external view returns (address);

  function poolLength() external view returns (uint256);

  function claimableReward(address _user, address[] calldata _tokens)
  external view returns (uint256[] memory);

  function handleAction(address _user, uint256 _balance, uint256 _totalSupply) external;

  function claim(address _user, address[] calldata _tokens) external;

}
