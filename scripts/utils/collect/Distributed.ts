import { ethers } from 'hardhat';
import { DeployerUtils } from '../../deploy/DeployerUtils';
import {
  AutoRewarder,
  Bookkeeper,
  ContractReader,
  SmartVault,
} from '../../../typechain';
import { utils } from 'ethers';

const EXCLUDED_PLATFORM = new Set<string>([
  '0',
  '1',
  '4',
  '6',
  '7',
  '10',
  '12',
]);

async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  console.log('signer', signer.address);

  const reader = (await DeployerUtils.connectInterface(
    signer,
    'ContractReader',
    tools.reader,
  )) as ContractReader;
  const bookkeeper = (await DeployerUtils.connectInterface(
    signer,
    'Bookkeeper',
    core.bookkeeper,
  )) as Bookkeeper;
  const rewarder = (await DeployerUtils.connectInterface(
    signer,
    'AutoRewarder',
    core.autoRewarder,
  )) as AutoRewarder;

  const allVaults = await bookkeeper.vaults();
  // const vaultsLength = (await bookkeeper.vaultsLength()).toNumber();
  console.log('vaults size', allVaults.length);

  const vaults: string[] = [];
  const vaultNames = new Map<string, string>();

  // for (let i = 0; i < vaultsLength; i++) {
  //   const vault = await bookkeeper._vaults(i);
  for (const vault of allVaults) {
    const vName = await reader.vaultName(vault);
    vaultNames.set(vault.toLowerCase(), vName);
    // console.log('vault', i, vault);
    const isActive = await reader.vaultActive(vault);
    if (!isActive) {
      // console.log('not active', vName);
      continue;
    }
    const vCtr = (await DeployerUtils.connectInterface(
      signer,
      'SmartVault',
      vault,
    )) as SmartVault;
    const platform = (
      await reader.strategyPlatform(await vCtr.strategy())
    ).toString();
    if (EXCLUDED_PLATFORM.has(platform)) {
      // console.log('platform excluded', vName, platform);
      continue;
    }
    vaults.push(vault);
  }

  console.log('sorted vaults', vaults.length);

  for (const item of vaults) {
    const amount = await rewarder.lastDistributedAmount(item);
    console.log(
      'distributed',
      vaultNames.get(item.toLowerCase()),
      utils.formatUnits(amount),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
