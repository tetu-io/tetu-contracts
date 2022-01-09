import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {appendFileSync, mkdir, readFileSync} from "fs";
import {ContractReader, Controller, IStrategy, VaultController} from "../../../../typechain";
import {MaticAddresses} from "../../../addresses/MaticAddresses";


async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/quick_pools_dual.csv', 'utf8').split(/\r?\n/);

  const deployed = [];
  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  for (const info of infos) {
    const strat = info.split(',');

    const ids = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const pool = strat[7];
    const rewardAmount = strat[8];
    const r0 = strat[14];
    const r1 = strat[15];
    const rewards = [MaticAddresses.QUICK_TOKEN, r1];

    if (+rewardAmount <= 0 || !token0 || ids === 'idx') {
      console.log('skip', ids);
      continue;
    }

    const vaultNameWithoutPrefix = `QUICK_${token0Name}_${token1Name}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    let strategyArgs;
    console.log('strat', ids, lpName);
    // tslint:disable-next-line:no-any
    const data: any[] = []
    data.push(await DeployerUtils.deployVaultAndStrategy(
      vaultNameWithoutPrefix,
      async vaultAddress => {
        strategyArgs = [
          core.controller,
          vaultAddress,
          lpAddress.toLowerCase(),
          token0,
          token1,
          pool,
          rewards
        ];
        return DeployerUtils.deployContract(
          signer,
          'StrategyQuickSwapLpDualAC',
          ...strategyArgs
        ) as Promise<IStrategy>
      },
      core.controller,
      core.psVault,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    ));
    data.push(strategyArgs);
    deployed.push(data);


    const txt = `vault: ${data[0][1].address} strategy: ${data[0][2].address}`;
    appendFileSync(`./tmp/deployed/QUICK_DUAL.txt`, txt, 'utf8');
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
