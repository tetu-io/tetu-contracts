import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {CoreAddresses} from "../../../../models/CoreAddresses";
import {DeployerUtils} from "../../../DeployerUtils";
import {ToolsAddresses} from "../../../../models/ToolsAddresses";
import {deployAndVerifySingleStrategy, findVaultAddress} from "../../StratUpdateUtils";

/**
 * Deploy given curve strategy to Matic/Fantom.
 * Assume here, that the constructor of the strategy has following params: controller, token, vaultAddress
 *
 * @param vaultNameWithoutPrefix
 * @param strategyName
 * @param strategyContractPath
 * @param token
 * @param fixedVaultAddress
 *    if not empty, then it's not necessary to search vaults address - we should just use provided address for vault
 *    (usefull for tests)
 */
export async function updateCurveStrategy(
  vaultNameWithoutPrefix: string,
  strategyName: string,
  strategyContractPath: string,
  token: string,
  fixedVaultAddress?: string
) : Promise<string | undefined> {
  const signer: SignerWithAddress = (await ethers.getSigners())[0];
  const core: CoreAddresses = await DeployerUtils.getCoreAddresses();
  const tools: ToolsAddresses = await DeployerUtils.getToolsAddresses();
  const destPath = `./tmp/update/strategies.txt`;

  // get the smart vault and ensure that it's active
  const vaultAddress = fixedVaultAddress
    ? fixedVaultAddress
    : await findVaultAddress(signer, tools, `TETU_${vaultNameWithoutPrefix}`);

  if (vaultAddress) {
    console.log(`Vault address is ${vaultAddress}`);
  } else {
    console.log('Vault not found!', vaultNameWithoutPrefix);
    return;
  }

  const strategyConstructorParams = [core.controller, token, vaultAddress];

  const strategyAddress: string | undefined = await deployAndVerifySingleStrategy(signer,
    core,
    vaultNameWithoutPrefix,
    vaultAddress,
    destPath,
    strategyName,
    strategyContractPath,
    strategyConstructorParams
  );

  console.log(
    strategyAddress
      ? `The strategy ${strategyName} is updated and verified. New strategy address is ${strategyAddress}`
      : `Failed to update strategy ${strategyName}`
  );

  return strategyAddress;
}