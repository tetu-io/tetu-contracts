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

/// @title Calculate estimated rewards for vaults based on on-chain metrics
/// @author belbix
contract RewardCalculator is Controllable {

  uint256 public constant PRECISION = 1e18;

  function kpi(address _vault) external view returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    if (vault.duration() == 0) {
      return 0;
    }
    address strategy = vault.strategy();
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    address rt = IController(controller()).rewardToken();

    uint256 lastRewards = 0;
    {
      uint256 rewardsSize = bookkeeper.vaultRewardsLength(_vault, rt);
      if (rewardsSize > 0) {
        lastRewards = bookkeeper.vaultRewards(_vault, rt, rewardsSize - 1);
      }
    }
    if (lastRewards == 0) {
      return 0;
    }

    (uint256 earned, uint256 lastEarnedTs) = strategyEarnedSinceLastDistribution(strategy);

    // lastEarnedTs can not be higher than current block
    uint256 timeSinceDistribution = block.timestamp - lastEarnedTs;

    uint256 reward = Math.min(lastRewards * timeSinceDistribution / vault.duration(), lastRewards);

    return PRECISION * earned / reward;
  }

  function strategyEarnedSinceLastDistribution(address strategy)
  public view returns (uint256 earned, uint256 lastEarnedTs){
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    uint256 lastEarned = 0;
    lastEarnedTs = 0;

    uint256 earnedSize = bookkeeper.strategyEarnedSnapshotsLength(strategy);
    if (earnedSize > 0) {
      lastEarned = bookkeeper.strategyEarnedSnapshots(strategy, earnedSize - 1);
      lastEarnedTs = bookkeeper.strategyEarnedSnapshotsTime(strategy, earnedSize - 1);
    }

    uint256 currentEarned = bookkeeper.targetTokenEarned(strategy);
    earned = currentEarned;
    if (currentEarned > lastEarned) {
      earned = currentEarned - lastEarned;
    }
  }

}
