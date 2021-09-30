import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ContractReader, SmartVault} from "../../typechain";
import {Web3Utils} from "./Web3Utils";
import {TokenUtils} from "../../test/TokenUtils";
import {utils} from "ethers";
import {mkdir, writeFileSync} from "fs";

const EVENT_NOTIFY = '0xac24935fd910bc682b5ccb1a07b718cadf8cf2f6d1404c4f3ddc3662dae40e29';
const xTETU = '0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454'.toLowerCase();
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
    if (v == core.psVault.address.toLowerCase()
        // || !vaultsForParsing.has(v)
        // || !(await reader.vaultActive(vault))
    ) {
      continue;
    }
    vaults.push(v);
    rewards.set(v, new Map<string, number>());
  }

  const logs = await Web3Utils.parseLogs(
      vaults,
      [EVENT_NOTIFY],
      START_BLOCK,
      currentBlock
  );

  for (let log of logs) {
    const logDecoded = web3.eth.abi.decodeLog([
          {
            "indexed": false,
            "internalType": "address",
            "name": "rewardToken",
            "type": "address"
          },
          {
            "indexed": false,
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }],
        log.data,
        log.topics.slice(1));
    const vault = log.address.toLowerCase();
    const rewardPerToken = rewards.get(vault) as Map<string, number>;
    const rt = logDecoded.rewardToken;
    const rtDec = await TokenUtils.decimals(rt);
    const amount = +utils.formatUnits(logDecoded.amount, rtDec);
    const prevAmount = rewardPerToken.get(rt.toLowerCase()) ?? 0;
    rewardPerToken.set(rt.toLowerCase(), prevAmount + amount);
    console.log('rt', rt, amount, prevAmount);
  }

  let data = 'vault, name, rewards, earned, kpi\n';
  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    try {
      const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
      const vaultName = await vaultCtr.name();
      const strategy = await vaultCtr.strategy();
      const earned = +utils.formatUnits(await reader.strategyEarned(strategy));

      const rewardPerToken = rewards.get(vault) as Map<string, number>;
      const kpi = (earned / (rewardPerToken.get(xTETU) ?? 0)) * 100;

      const info =
          vault + ',' +
          vaultName + ',' +
          rewardPerToken.get(xTETU) + ',' +
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
