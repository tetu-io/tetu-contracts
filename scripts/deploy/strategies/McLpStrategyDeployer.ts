import {ethers} from "hardhat";
import {RunHelper} from "../../utils/tools/RunHelper";
import {DeployerUtils} from "../DeployerUtils";
import {
  ContractReader,
  Controller,
  IUniswapV2Pair,
  SmartVault,
  VaultController
} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";


export class McLpStrategyDeployer {

  public static async deploy(
      underlying: string,
      poolId: number,
      platformPrefix: string,
      strategyName: string,
      strategyPath: string
  ) {
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

    const lpCont = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', underlying) as IUniswapV2Pair
    const token0 = await lpCont.token0();
    const token0Name = await TokenUtils.tokenSymbol(token0);
    const token1 = await lpCont.token1();
    const token1Name = await TokenUtils.tokenSymbol(token1);

    // *********** DEPLOY VAULT
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;
    const strategy = await DeployerUtils.deployContract(
        signer,
        strategyName,
        core.controller,
        vault.address,
        underlying,
        token0,
        token1,
        poolId
    );

    const vaultNameWithoutPrefix = `${platformPrefix}_${token0Name}_${token1Name}`;

    console.log('vaultNameWithoutPrefix', vaultNameWithoutPrefix);

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      return;
    }

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
        `TETU_${vaultNameWithoutPrefix}`,
        `x${vaultNameWithoutPrefix}`,
        controller.address,
        underlying,
        60 * 60 * 24 * 28,
        false,
        core.psVault
    ));

    // ! gov actions
    if ((await ethers.provider.getNetwork()).name !== "matic") {
      await controller.addVaultAndStrategy(vault.address, strategy.address);
    }

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verify(vaultLogic.address);
      await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
      await DeployerUtils.verifyProxy(vaultProxy.address);
      await DeployerUtils.verifyWithContractName(strategy.address, strategyPath, [
        core.controller,
        vault.address,
        underlying,
        token0,
        token1,
        poolId
      ]);
    }

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });

    const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
    writeFileSync(`./tmp/deployed/${vaultNameWithoutPrefix}.txt`, txt, 'utf8');
  }
}
