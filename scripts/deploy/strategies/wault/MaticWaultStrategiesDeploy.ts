import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, Controller, IStrategy} from "../../../../typechain";
import {readFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;

  const infos = readFileSync('scripts/utils/generate/wault_pools.csv', 'utf8').split(/\r?\n/);

  const deployed = [];
  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (let vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }


  for (let info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || idx == '0' || !lp_name) {
      console.log('skip', idx);
      continue;
    }

    let vaultNameWithoutPrefix: string;
    if (token1) {
      vaultNameWithoutPrefix = `WAULT_${token0_name}_${token1_name}`;
    } else {
      vaultNameWithoutPrefix = `WAULT_${token0_name}`;
    }

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, lp_name);

    let data: any[];
    if(token1) {
      data = await DeployerUtils.deployAndInitVaultAndStrategy(
          vaultNameWithoutPrefix,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              'StrategyWaultLp',
              core.controller,
              vaultAddress,
              lp_address,
              token0,
              token1,
              idx
          ) as Promise<IStrategy>,
          controller,
          core.psVault,
          signer,
          60 * 60 * 24 * 28,
          true
      );
      data.push([
        core.controller,
        data[1].address,
        lp_address,
        token0,
        token1,
        idx
      ]);
    } else {
      data = await DeployerUtils.deployAndInitVaultAndStrategy(
          vaultNameWithoutPrefix,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              'StrategyWaultSingle',
              core.controller,
              vaultAddress,
              lp_address,
              idx
          ) as Promise<IStrategy>,
          controller,
          core.psVault,
          signer,
          60 * 60 * 24 * 28,
          true
      );
      data.push([
        core.controller,
        data[1].address,
        lp_address,
        token0,
        token1,
        idx
      ]);
    }


    deployed.push(data);
  }

  await DeployerUtils.wait(5);

  for (let data of deployed) {
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
