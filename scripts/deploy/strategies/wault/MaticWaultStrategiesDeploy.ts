import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, Controller, IStrategy, VaultController} from "../../../../typechain";
import {readFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

  const infos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

  const deployed = [];
  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
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

    if (+alloc <= 0 || idx === 'idx' || idx === '0' || !lpName) {
      console.log('skip', idx);
      continue;
    }

    let vaultNameWithoutPrefix: string;
    if (token1) {
      vaultNameWithoutPrefix = `WAULT_${token0Name}_${token1Name}`;
    } else {
      vaultNameWithoutPrefix = `WAULT_${token0Name}`;
    }

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, lpName);

    // tslint:disable-next-line:no-any
    let data: any[];
    if (token1) {
      data = await DeployerUtils.deployAndInitVaultAndStrategy(
        lpAddress,
        vaultNameWithoutPrefix,
        async vaultAddress => DeployerUtils.deployContract(
          signer,
          'StrategyWaultLp',
          core.controller,
          vaultAddress,
          lpAddress,
          token0,
          token1,
          idx
        ) as Promise<IStrategy>,
        controller,
        vaultController,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        0,
        true
      );
      data.push([
        core.controller,
        data[1].address,
        lpAddress,
        token0,
        token1,
        idx
      ]);
    } else {
      data = await DeployerUtils.deployAndInitVaultAndStrategy(
        lpAddress,
        vaultNameWithoutPrefix,
        async vaultAddress => DeployerUtils.deployContract(
          signer,
          'StrategyWaultSingle',
          core.controller,
          vaultAddress,
          lpAddress,
          idx
        ) as Promise<IStrategy>,
        controller,
        vaultController,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        0,
        true
      );
      data.push([
        core.controller,
        data[1].address,
        lpAddress,
        token0,
        token1,
        idx
      ]);
    }


    deployed.push(data);
  }

  await DeployerUtils.wait(5);

  for (const data of deployed) {
    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithArgs(data[2].address, data[3]);

  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
