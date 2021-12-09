import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader, RewardCalculator, SmartVault} from "../../../typechain";
import {utils} from "ethers";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../addresses/MaticAddresses";

const EXCLUDED_PLATFORM = new Set<string>([
  '0',
  '1',
  '4',
  '6',
  '7',
  '10',
  '12', // swap
]);

async function main() {
  mkdir('./tmp/stats', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const signer = (await ethers.getSigners())[0];
  const coreAdrs = await DeployerUtils.getCoreAddresses();
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddresses();

  const reader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;
  const rewardCalculator = await DeployerUtils.connectInterface(signer, 'RewardCalculator', coreAdrs.rewardCalculator) as RewardCalculator;

  const vaultsPure = await core.bookkeeper.vaults();
  console.log('vaultsPure', vaultsPure.length)

  const rewards = new Map<string, Map<string, number>>();
  const psPpfs = +utils.formatUnits(await core.psVault.getPricePerFullShare());

  const vaults: string[] = [];

  for (let vault of vaultsPure) {
    vault = vault.toLowerCase();
    const isActive = await reader.vaultActive(vault);
    if (!isActive) {
      continue;
    }
    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const platform = (await reader.strategyPlatform(await vCtr.strategy())).toString();
    if (EXCLUDED_PLATFORM.has(platform)) {
      continue;
    }
    vaults.push(vault);
    rewards.set(vault, new Map<string, number>());
  }

  let data = 'Vault, Name, Duration, Reward, AvgReward, EarnedTotal, Earned, KPI, KPI on-chain, est rewards\n';
  for (const vault of vaults) {
    try {
      const currentTs = Math.floor(Date.now() / 1000);
      const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
      const vaultName = await vaultCtr.name();

      const strategy = await vaultCtr.strategy();

      const rewardsSize = (await core.bookkeeper.vaultRewardsLength(vault, MaticAddresses.xTETU)).toNumber();
      let lastRewards: number = 0;
      if (rewardsSize !== 0) {
        lastRewards = +utils.formatUnits(await core.bookkeeper.vaultRewards(vault, MaticAddresses.xTETU, rewardsSize - 1)) * psPpfs;
      }
      console.log('lastRewards', lastRewards);

      const earnedSize = (await core.bookkeeper.strategyEarnedSnapshotsLength(strategy)).toNumber();
      let lastEarned: number = 0;
      let lastSnapshotTs: number = 0;
      if (earnedSize !== 0) {
        lastEarned = +utils.formatUnits(await core.bookkeeper.strategyEarnedSnapshots(strategy, earnedSize - 1));
        lastSnapshotTs = (await core.bookkeeper.strategyEarnedSnapshotsTime(strategy, earnedSize - 1)).toNumber();
      }

      const currentEarned = +utils.formatUnits(await core.bookkeeper.targetTokenEarned(strategy));
      console.log('currentEarned', currentEarned)
      console.log('lastEarned', lastEarned)
      const earned = currentEarned - lastEarned;

      const timeSinceDistribution = currentTs - lastSnapshotTs;
      const avgDistributedRewards = +utils.formatUnits(await rewardCalculator.vaultLastTetuReward(vault));

      const kpi = (earned / avgDistributedRewards) * 100;
      console.log('kpi', kpi);

      const kpiFromCalc = +utils.formatUnits(await rewardCalculator.kpi(vault)) * 100;
      const estRewards = utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24));

      const info =
        vault + ',' +
        vaultName + ',' +
        (timeSinceDistribution / 60 / 60).toFixed(0) + 'h,' +
        lastRewards + ',' +
        avgDistributedRewards + ',' +
        currentEarned + ',' +
        earned + ',' +
        kpi + ',' +
        kpiFromCalc + ',' +
        estRewards
        + '\n';
      console.log(info);
      data += info;
      writeFileSync(`./tmp/stats/kpi2.txt`, data, 'utf8');
    } catch (e) {
      console.log('Error write vault', vault, e);
    }
  }

}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
