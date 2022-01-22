import { ethers } from 'hardhat';
import { DeployerUtils } from '../../DeployerUtils';
import {
  ContractReader,
  Controller,
  IStrategy,
  SmartVault,
  VaultController,
} from '../../../../typechain';
import { appendFileSync, mkdir, readFileSync } from 'fs';

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir('./tmp/update', { recursive: true }, (err) => {
    if (err) throw err;
  });

  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const controller = (await DeployerUtils.connectContract(
    signer,
    'Controller',
    core.controller,
  )) as Controller;
  const vaultController = (await DeployerUtils.connectContract(
    signer,
    'VaultController',
    core.vaultController,
  )) as VaultController;

  const infos = readFileSync(
    'scripts/utils/download/data/sushi_pools.csv',
    'utf8',
  ).split(/\r?\n/);

  const deployed = [];

  const cReader = (await DeployerUtils.connectContract(
    signer,
    'ContractReader',
    tools.reader,
  )) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !idx) {
      console.log('skip', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `SUSHI_${token0Name}_${token1Name}`;

    const vAdr = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log('Vault not found!', vaultNameWithoutPrefix);
      continue;
    }

    const vCtr = (await DeployerUtils.connectInterface(
      signer,
      'SmartVault',
      vAdr,
    )) as SmartVault;

    if (!(await vCtr.active())) {
      console.log('vault not active', vAdr);
      continue;
    }

    const strCtr = (await DeployerUtils.connectInterface(
      signer,
      'IStrategy',
      await vCtr.strategy(),
    )) as IStrategy;
    const strName = await strCtr.STRATEGY_NAME();
    if (strName === 'MCv2StrategyAC') {
      console.log('already ac');
      continue;
    }

    console.log('strat', idx, lpName);

    const strategy = (await DeployerUtils.deployContract(
      signer,
      'StrategySushiSwapLpWithAc',
      core.controller,
      vAdr,
      lpAddress,
      token0,
      token1,
      idx,
    )) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    if ((await ethers.provider.getNetwork()).name !== 'hardhat') {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(
        strategy.address,
        'contracts/strategies/matic/sushiswap/StrategySushiSwapLpWithAc.sol:StrategySushiSwapLpWithAc',
        [core.controller, vAdr, lpAddress, token0, token1, idx],
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
