import {appendFileSync, mkdir, readFileSync, writeFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, Controller, SmartVault, VaultController} from "../../../../typechain";
import {ethers} from "hardhat";
import {RunHelper} from "../../../utils/tools/RunHelper";

async function main() {

  const infos = readFileSync('scripts/utils/download/data/nacho_pools.csv', 'utf8').split(/\r?\n/);

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

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
    const rewardPool = strat[7];

    if (idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      continue;
    }

    console.log('strat', idx, lpName);

    // *** VARIABLES
    const strategyContractName = 'StrategyNachoLp';
    const strategyPath = '';
    const underlying = lpAddress;
    const platformPrefix = 'NACHO';
    // *****

    const vaultNameWithoutPrefix = `${platformPrefix}_${token0Name}_${token1Name}`;

    console.log('vaultNameWithoutPrefix', vaultNameWithoutPrefix);

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      return;
    }


    // *********** DEPLOY VAULT
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    // *********** DEPLOY STRAT
    const strategyArgs = [
      core.controller,
      vault.address,
      underlying,
      token0,
      token1,
      rewardPool,
      idx
    ];
    const strategy = await DeployerUtils.deployContract(
      signer,
      strategyContractName,
      ...strategyArgs
    );

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
      `TETU_${vaultNameWithoutPrefix}`,
      `x${vaultNameWithoutPrefix}`,
      controller.address,
      underlying,
      60 * 60 * 24 * 28,
      false,
      core.psVault,
      0
    ));

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verify(vaultLogic.address);
      await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
      await DeployerUtils.verifyProxy(vaultProxy.address);
      await DeployerUtils.verifyWithContractName(strategy.address, strategyPath, strategyArgs);
    }

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });

    const txt = `${vaultNameWithoutPrefix} vault: ${vault.address}\nstrategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/deployed/${platformPrefix}.txt`, txt, 'utf8');

  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
