import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ContractReader, SmartVault} from "../../typechain";
import {utils} from "ethers";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../test/MaticAddresses";

const EVENT_NOTIFY = '0xac24935fd910bc682b5ccb1a07b718cadf8cf2f6d1404c4f3ddc3662dae40e29';
const START_BLOCK = 17462342;

async function main() {
  mkdir('./tmp/stats', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddresses();

  const reader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;

  const vaultsPure = await core.bookkeeper.vaults();
  console.log('vaultsPure', vaultsPure.length)

  const currentBlock = await web3.eth.getBlockNumber();

  const rewards = new Map<string, Map<string, number>>();

  const vaults: string[] = [];

  for (let vault of vaultsPure) {
    const v = vault.toLowerCase();
    if (
        v === core.psVault.address.toLowerCase()
        || v === MaticAddresses.dxTETU
        // || v !== '0xfA9D84A7aC9e2dC4DD43D566673B6C018E601b44'.toLowerCase()
        // || !vaultsForParsing.has(v)
        // || !(await reader.vaultActive(vault))
    ) {
      continue;
    }
    vaults.push(v);
    rewards.set(v, new Map<string, number>());
  }

  let data = 'Vault, Name, Duration, Full Reward, Reward, Earned, KPI\n';
  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    try {
      const currentTs = Math.floor(Date.now() / 1000);
      const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
      const vaultName = await vaultCtr.name();

      const rewardDuration = (await vaultCtr.duration()).toNumber();

      const strategy = await vaultCtr.strategy();

      const rewardsSize = (await core.bookkeeper.vaultRewardsLength(vault, MaticAddresses.xTETU)).toNumber();
      let lastRewards: number = 0;
      if (rewardsSize !== 0) {
        lastRewards = +utils.formatUnits(await core.bookkeeper.vaultRewards(vault, MaticAddresses.xTETU, rewardsSize - 1));
      }
      console.log('lastRewards', lastRewards);

      const earnedSize = (await core.bookkeeper.strategyEarnedSnapshotsLength(strategy)).toNumber();
      let lastEarned: number = 0;
      let lastEarnedTs: number = 0;
      if (earnedSize !== 0) {
        lastEarned = +utils.formatUnits(await core.bookkeeper.strategyEarnedSnapshots(strategy, earnedSize - 1));
        lastEarnedTs = (await core.bookkeeper.strategyEarnedSnapshotsTime(strategy, earnedSize - 1)).toNumber();
      }

      const currentEarned = +utils.formatUnits(await core.bookkeeper.targetTokenEarned(strategy));
      console.log('currentEarned', currentEarned)
      console.log('lastEarned', lastEarned)
      const earned = currentEarned - lastEarned;

      const timeSinceDistribution = currentTs - lastEarnedTs;
      const durationRatio = Math.min(timeSinceDistribution / rewardDuration, 1);
      const reward = lastRewards * durationRatio;
      console.log('reward', reward, durationRatio)

      const kpi = (earned / reward) * 100;

      const info =
          vault + ',' +
          vaultName + ',' +
          (timeSinceDistribution / 60 / 60).toFixed(1) + ',' +
          lastRewards + ',' +
          reward + ',' +
          earned + ',' +
          kpi
          + '\n';
      console.log(info);
      data += info;
      await writeFileSync(`./tmp/stats/kpi.txt`, data, 'utf8');
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
