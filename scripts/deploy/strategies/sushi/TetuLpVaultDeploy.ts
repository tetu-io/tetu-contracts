import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  ContractReader,
  Controller,
  IUniswapV2Pair,
  NoopStrategy,
  SmartVault,
  VaultController
} from "../../../../typechain";
import {TokenUtils} from "../../../../test/TokenUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";


async function main() {
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

  const tetuLp = (await DeployerUtils.getTokenAddresses()).get('sushi_lp_token_usdc') as string;

  const lpCont = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', tetuLp) as IUniswapV2Pair
  const token0 = await lpCont.token0();
  const token0Name = await TokenUtils.tokenSymbol(token0);
  const token1 = await lpCont.token1();
  const token1Name = await TokenUtils.tokenSymbol(token1);

  // *********** DEPLOY VAULT
  const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
  const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
  const tetuLpVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
  const tetuLpEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller, tetuLp, tetuLpVault.address, [], [MaticAddresses.USDC_TOKEN, core.rewardToken], 3) as NoopStrategy;

  const vaultNameWithoutPrefix = `SUSHI_${token0Name}_${token1Name}`;

  console.log('vaultNameWithoutPrefix', vaultNameWithoutPrefix);

  if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
    console.log('Strategy already exist', vaultNameWithoutPrefix);
    return;
  }

  await tetuLpVault.initializeSmartVault(
      `TETU_${vaultNameWithoutPrefix}`,
      `x${vaultNameWithoutPrefix}`,
      controller.address,
      tetuLp,
      60 * 60 * 24 * 28,
      false,
      core.psVault,
    0
  );

  await controller.addVaultAndStrategy(tetuLpVault.address, tetuLpEmptyStrategy.address);


  await DeployerUtils.wait(5);


  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vaultProxy.address);
  await DeployerUtils.verifyWithArgs(tetuLpEmptyStrategy.address,
      [core.controller, tetuLp, tetuLpVault.address, [], [MaticAddresses.USDC_TOKEN, core.rewardToken]]);

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
