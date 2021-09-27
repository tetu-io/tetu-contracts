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
import {MaticAddresses} from "../../../../test/MaticAddresses";
import {TokenUtils} from "../../../../test/TokenUtils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (let vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  const tetuLp = MaticAddresses.SUSHI_TETU_WMATIC;

  const lpCont = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', tetuLp) as IUniswapV2Pair
  const token0 = await lpCont.token0();
  const token0_name = await TokenUtils.tokenSymbol(token0);
  const token1 = await lpCont.token1();
  const token1_name = await TokenUtils.tokenSymbol(token1);

  // *********** DEPLOY VAULT
  const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
  const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
  const tetuLpVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
  const tetuLpEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller, tetuLp, tetuLpVault.address, [], [token0, token1], 3) as NoopStrategy;

  const vaultNameWithoutPrefix = `SUSHI_${token0_name}_${token1_name}`;

  console.log('vaultNameWithoutPrefix', vaultNameWithoutPrefix);

  if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
    console.log('Strategy already exist', vaultNameWithoutPrefix);
    return;
  }

  await tetuLpVault.initializeSmartVault(
      `TETU_${vaultNameWithoutPrefix}`,
      `x${vaultNameWithoutPrefix}`,
      core.controller,
      tetuLp,
      60 * 60 * 24 * 28,
      false,
      core.psVault
  );

  await DeployerUtils.wait(5);


  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vaultProxy.address);
  await DeployerUtils.verifyWithArgs(tetuLpEmptyStrategy.address,
      [core.controller, tetuLp, tetuLpVault.address, [], [token0, token1], 3]);

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
