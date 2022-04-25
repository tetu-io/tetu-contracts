// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface IMegaPool {

  event RewardAdded(address indexed rewardToken, uint256 reward, uint256 periodFinish);
  event Staked(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 amount);
  event RewardPaid(address indexed rewardToken, address indexed user, uint256 reward);
  event RewardsDistributionTransferred(address indexed oldRewardsDistribution, address indexed newRewardsDistribution);

  struct Rewards {
    uint128 userRewardPerTokenPaid; // reward per token already paid
    uint128 rewardToPay; // stored amount of reward torken to pay
  }

  struct RewardToken {
    uint16 index; // index in rewardsTokensArray
    uint32 periodFinish;  // time in seconds rewards will end
    uint32 lastUpdateTime; // last time reward info was updated
    uint128 rewardPerTokenStored; // reward per token
    uint128 rewardRate; // how many reward tokens to give out per second
    mapping(address => Rewards) rewards;
  }

  struct AppStorage {
    address rewardsDistribution;
    IERC20 stakingToken;
    address[] rewardTokensArray;

    uint256 totalSupply;
    mapping(address => uint256) balances;
    mapping(address => RewardToken) rewardTokens;
  }

  struct RewardTokenInfo {
    uint256 index; // index in rewardsTokensArray
    uint256 periodFinish; // rewards end at this time in seconds
    uint256 rewardRate; // how many reward tokens per second
    uint256 rewardPerTokenStored; // how many reward tokens per staked token stored
    uint256 lastUpdateTime; // last time tht rewar
  }

  struct Earned {
    address rewardToken;
    uint256 earned;
  }

  struct RewardTokenArgs {
    address rewardToken; // ERC20 address
    uint256 reward; // total reward amount
    uint256 rewardDuration; // how many seconds rewards are distributed
  }

  function rewardsDistribution() external view returns (address);

  function transferRewardsDistribution(address _newRewardsDistribution) external;

  function totalSupply() external view returns (uint256 totalSupply_);

  function stakingToken() external view returns (address);

  function rewardTokensArray() external view returns (address[] memory rewardTokens_);

  function balanceOf(address _account) external view returns (uint256);

  function rewardTokenInfo(address _rewardToken) external view returns (RewardTokenInfo memory);

  function earned(address _rewardToken, address _account) external view returns (uint256);

  function earned(address _account) external view returns (Earned[] memory earned_);

  function stakeWithPermit(uint256 _amount, uint _deadline, uint8 _v, bytes32 _r, bytes32 _s) external;

  function stake(uint256 _amount) external;

  function getRewards() external;

  function getSpecificRewards(address[] calldata _rewardTokensArray) external;

  function withdraw(uint256 _amount) external;

  function exit() external;

  function notifyRewardAmount(RewardTokenArgs[] calldata _args) external;
}
