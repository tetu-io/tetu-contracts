// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/
pragma solidity 0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../base/interface/IStrategy.sol";
import "../../base/interface/IBookkeeper.sol";
import "../../base/interface/IControllableExtended.sol";
import "../price/IPriceCalculator.sol";
import "./IRewardCalculator.sol";

/// @title Calculate estimated strategy rewards
/// @author belbix
contract RewardCalculator is Controllable, IRewardCalculator {

  // ************** CONSTANTS *****************************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.5.3";
  uint256 public constant PRECISION = 1e18;
  uint256 public constant MULTIPLIER_DENOMINATOR = 100;
  uint256 public constant BLOCKS_PER_MINUTE = 2727; // 27.27
  string private constant _CALCULATOR = "calculator";
  uint256 private constant _BUY_BACK_DENOMINATOR = 10000;
  uint256 public constant AVG_REWARDS = 7;
  uint256 public constant SNAPSHOTS_AVG_TIME = 7 days;

  // ************** VARIABLES *****************************
  // !!!!!!!!! DO NOT CHANGE NAMES OR ORDERING!!!!!!!!!!!!!
  mapping(bytes32 => address) internal tools;
  mapping(IStrategy.Platform => uint256) internal platformMultiplier;
  mapping(uint256 => uint256) internal platformMultiplierV2;

  function initialize(address _controller, address _calculator) external initializer {
    Controllable.initializeControllable(_controller);
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = _calculator;
  }

  // ************* MAIN ***********************************

  function priceCalculator() public view returns (IPriceCalculator) {
    return IPriceCalculator(tools[keccak256(abi.encodePacked(_CALCULATOR))]);
  }

  function getPrice(address _token) public view override returns (uint256) {
    return priceCalculator().getPriceWithDefaultOutput(_token);
  }

  function strategyRewardsUsd(address _strategy, uint256 _period) public view override returns (uint256) {
    return rewardBasedOnBuybacks(_strategy) * _period;
  }

  function adjustRewardPerSecond(uint rewardsPerSecond, IStrategy strategy) public view returns (uint) {
    if (strategy.buyBackRatio() < _BUY_BACK_DENOMINATOR) {
      rewardsPerSecond = rewardsPerSecond * strategy.buyBackRatio() / _BUY_BACK_DENOMINATOR;
    }

    uint256 _kpi = kpi(strategy.vault());
    uint256 multiplier = platformMultiplierV2[uint256(strategy.platform())];

    if (_kpi != 0) {
      rewardsPerSecond = rewardsPerSecond * _kpi / PRECISION;
    } else {
      // no rewards for strategies without profit
      return 0;
    }

    if (multiplier != 0) {
      rewardsPerSecond = rewardsPerSecond * multiplier / MULTIPLIER_DENOMINATOR;
    }
    return rewardsPerSecond;
  }

  /// @dev Return recommended USD amount of rewards for this vault based on TVL ratio
  function rewardsPerTvl(address _vault, uint256 _period) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    uint256 rewardAmount = strategyRewardsUsd(vault.strategy(), _period);
    uint256 ratio = vaultTVLRatio(_vault);
    return rewardAmount * ratio / PRECISION;
  }

  function vaultTVLRatio(address _vault) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    uint256 poolTvl = IStrategy(vault.strategy()).poolTotalAmount();
    if (poolTvl == 0) {
      return 0;
    }
    return vault.underlyingBalanceWithInvestment() * PRECISION / poolTvl;
  }

  function rewardPerBlockToPerSecond(uint256 amount) public pure returns (uint256) {
    return amount * BLOCKS_PER_MINUTE / 6000;
  }

  function mcRewardPerSecond(
    uint256 allocPoint,
    uint256 rewardPerSecond,
    uint256 totalAllocPoint
  ) public pure returns (uint256) {
    return rewardPerSecond * allocPoint / totalAllocPoint;
  }

  function kpi(address _vault) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    if (vault.duration() == 0) {
      return 0;
    }

    uint256 lastRewards = vaultLastTetuReward(_vault);
    if (lastRewards == 0) {
      return 0;
    }

    (uint256 earned,) = strategyEarnedSinceLastDistribution(vault.strategy());

    return PRECISION * earned / lastRewards;
  }

  function vaultLastTetuReward(address _vault) public view override returns (uint256) {
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    ISmartVault ps = ISmartVault(IController(controller()).psVault());
    uint256 rewardsSize = bookkeeper.vaultRewardsLength(_vault, address(ps));
    uint rewardSum = 0;
    if (rewardsSize > 0) {
      uint count = 0;
      for (uint i = 1; i <= Math.min(AVG_REWARDS, rewardsSize); i++) {
        rewardSum += vaultTetuReward(_vault, rewardsSize - i);
        count++;
      }
      return rewardSum / count;
    }
    return 0;
  }

  function vaultTetuReward(address _vault, uint i) public view returns (uint256) {
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    ISmartVault ps = ISmartVault(IController(controller()).psVault());
    uint amount = bookkeeper.vaultRewards(_vault, address(ps), i);
    // we distributed xTETU, need to calculate approx TETU amount
    // assume that xTETU ppfs didn't change dramatically
    return amount * ps.getPricePerFullShare() / ps.underlyingUnit();
  }

  function strategyEarnedSinceLastDistribution(address strategy)
  public view override returns (uint256 earned, uint256 lastEarnedTs){
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    uint256 lastEarned = 0;
    lastEarnedTs = 0;
    earned = 0;

    uint256 earnedSize = bookkeeper.strategyEarnedSnapshotsLength(strategy);
    if (earnedSize > 0) {
      lastEarned = bookkeeper.strategyEarnedSnapshots(strategy, earnedSize - 1);
      lastEarnedTs = bookkeeper.strategyEarnedSnapshotsTime(strategy, earnedSize - 1);
    }
    lastEarnedTs = Math.max(lastEarnedTs, IControllableExtended(strategy).created());
    uint256 currentEarned = bookkeeper.targetTokenEarned(strategy);
    if (currentEarned >= lastEarned) {
      earned = currentEarned - lastEarned;
    }
  }

  function strategyEarnedAvg(address strategy)
  public view returns (uint256 earned, uint256 lastEarnedTs){
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    lastEarnedTs = 0;
    earned = 0;

    uint256 length = bookkeeper.strategyEarnedSnapshotsLength(strategy);
    if (length >= 2) {
      uint lastPoint = block.timestamp - SNAPSHOTS_AVG_TIME;
      uint lastSnapshot = bookkeeper.strategyEarnedSnapshots(strategy, length - 1);
      uint targetSnapshot = lastSnapshot;
      for (uint i = length - 1; i > 0; i--) {
        uint256 time = bookkeeper.strategyEarnedSnapshotsTime(strategy, i - 1);
        if (lastPoint > time || i == 1) {
          targetSnapshot = bookkeeper.strategyEarnedSnapshots(strategy, i - 1);
          lastEarnedTs = time;
          break;
        }
      }
      earned = lastSnapshot - targetSnapshot;
    } else if (length == 1) {
      earned = bookkeeper.strategyEarnedSnapshots(strategy, length - 1);
    }
  }

  function rewardBasedOnBuybacks(address strategy) public view returns (uint256){
    uint lastHw = IBookkeeper(IController(controller()).bookkeeper()).lastHardWork(strategy).time;
    (uint256 earned, uint256 lastEarnedTs) = strategyEarnedAvg(strategy);
    uint timeDiff = block.timestamp - lastEarnedTs;
    if (lastEarnedTs == 0 || timeDiff == 0 || lastHw == 0 || (block.timestamp - lastHw) > 3 days) {
      return 0;
    }
    uint256 tetuPrice = getPrice(IController(controller()).rewardToken());
    uint earnedUsd = earned * tetuPrice / PRECISION;
    uint rewardsPerSecond = earnedUsd / timeDiff;

    uint256 multiplier = platformMultiplierV2[uint256(IStrategy(strategy).platform())];
    if (multiplier != 0) {
      rewardsPerSecond = rewardsPerSecond * multiplier / MULTIPLIER_DENOMINATOR;
    }
    return rewardsPerSecond;
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = newValue;
    emit ToolAddressUpdated(_CALCULATOR, newValue);
  }

  function setPlatformMultiplier(uint256 _platform, uint256 _value) external onlyControllerOrGovernance {
    require(_value < MULTIPLIER_DENOMINATOR * 10, "RC: Too high value");
    platformMultiplierV2[_platform] = _value;
  }
}
