import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  ContractReader,
  Controller,
  IStrategy,
  StrategyIronFold,
  VaultController
} from "../../../../typechain";
import {mkdir, readFileSync, writeFileSync} from "fs";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

  const infos = readFileSync('scripts/utils/download/data/iron_markets.csv', 'utf8').split(/\r?\n/);

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  // *********** DEPLOY VAULT
  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const rTokenName = strat[1];
    const rTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];

    if (idx === 'idx' || !token) {
      console.log('skip', idx);
      continue;
    }

    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `IRON_LOAN_${tokenName}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, rTokenName, vaultNameWithoutPrefix);

    const data = await DeployerUtils.deployVaultAndStrategy(
        vaultNameWithoutPrefix,
        async vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronFold',
            core.controller,
            vaultAddress,
            token,
            rTokenAddress,
            borrowTarget,
            collateralFactor
        ) as Promise<IStrategy>,
        core.controller,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        true
    );

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(data[2].address, 'contracts/strategies/matic/iron/StrategyIronFold.sol:StrategyIronFold', [
        core.controller,
        data[1].address,
        token,
        rTokenAddress,
        borrowTarget,
        collateralFactor
      ]);
    }


    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });

    writeFileSync(`./tmp/deployed/${vaultNameWithoutPrefix}.txt`, JSON.stringify(data), 'utf8');
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
