import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {ContractReader, IStrategy} from "../../../typechain";
import {writeFileSync} from "fs";

export class SingleTokenVaultStrategyDeploy {


  public static async deploy(
    underlying: string,
    tokenName: string,
    strategyName: string
  ) {
    const signer = (await ethers.getSigners())[0];
    const core = await DeployerUtils.getCoreAddresses();
    const tools = await DeployerUtils.getToolsAddresses();

    const vaultNames = new Set<string>();

    const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

    const deployedVaultAddresses = await cReader.vaults();
    console.log('all vaults size', deployedVaultAddresses.length);

    for (const vAdr of deployedVaultAddresses) {
      vaultNames.add(await cReader.vaultName(vAdr));
    }

    const vaultNameWithoutPrefix = tokenName;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
    }

    const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultAndStrategy(
      vaultNameWithoutPrefix,
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        strategyName,
        core.controller,
        vaultAddress,
        underlying
      ) as Promise<IStrategy>,
      core.controller,
      core.psVault,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    );

    await DeployerUtils.wait(5);
    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
    await DeployerUtils.verifyProxy(vault.address);
    await DeployerUtils.verifyWithArgs(strategy.address, [
      core.controller,
      vault.address,
      underlying
    ]);

    const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
    writeFileSync(`./tmp/deployed/${vaultNameWithoutPrefix}.txt`, txt, 'utf8');
  }

}
