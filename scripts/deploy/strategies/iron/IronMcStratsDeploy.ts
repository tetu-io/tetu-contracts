import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, Controller, IStrategy, VaultController} from "../../../../typechain";
import {readFileSync, writeFileSync} from "fs";

const ironSwapIds = new Set<string>([
  "0",
  "3"
]);

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

  const infos = readFileSync('scripts/utils/download/data/iron_pools.csv', 'utf8').split(/\r?\n/);

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (let vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  // *********** DEPLOY VAULT
  for (let info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const tokens = strat[4]?.split(' | ');
    const tokenNames = strat[5]?.split(' | ');
    const alloc = strat[6];

    if (+alloc <= 0 || idx === 'idx' || !tokens) {
      console.log('skip', idx);
      continue;
    }


    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `IRON_${tokenNames.join('_')}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, lp_name, vaultNameWithoutPrefix);
    let data: any[];

    if (ironSwapIds.has(idx)) {
      data = await DeployerUtils.deployVaultAndStrategy(
          vaultNameWithoutPrefix,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              'StrategyIronSwap',
              core.controller,
              vaultAddress,
              lp_address,
              tokens,
              idx
          ) as Promise<IStrategy>,
          controller,
          vaultController,
          core.psVault,
          signer,
          60 * 60 * 24 * 28,
          true
      );

      if ((await ethers.provider.getNetwork()).name !== "hardhat") {
        await DeployerUtils.wait(5);
        await DeployerUtils.verifyWithContractName(data[2].address, 'contracts/strategies/matic/iron/StrategyIronSwap.sol:StrategyIronSwap', [
          core.controller,
          data[1].address,
          lp_address,
          tokens,
          idx
        ]);
      }
    } else {
      data = await DeployerUtils.deployVaultAndStrategy(
          vaultNameWithoutPrefix,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              'StrategyIronUniPair',
              core.controller,
              vaultAddress,
              lp_address,
              tokens[0],
              tokens[1],
              idx
          ) as Promise<IStrategy>,
          controller,
          vaultController,
          core.psVault,
          signer,
          60 * 60 * 24 * 28,
          true
      );

      if ((await ethers.provider.getNetwork()).name !== "hardhat") {
        await DeployerUtils.wait(5);
        await DeployerUtils.verifyWithContractName(data[2].address, 'contracts/strategies/matic/iron/StrategyIronUniPair.sol:StrategyIronUniPair', [
          core.controller,
          data[1].address,
          lp_address,
          tokens[0],
          tokens[1],
          idx
        ]);
      }
    }

    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);

    await writeFileSync(`./tmp/${vaultNameWithoutPrefix}.txt`, JSON.stringify(data), 'utf8');
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
