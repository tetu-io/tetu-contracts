import {ethers} from "hardhat";
import {ContractReader, IStrategy} from "../../../../typechain";
import {writeFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {FtmAddresses} from "../../../addresses/FtmAddresses";

async function main() {
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

  const vaultNameWithoutPrefix = `CRV_2POOL`;

  if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
    console.log('Strategy already exist', vaultNameWithoutPrefix);
  }

  const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultAndStrategy(
    vaultNameWithoutPrefix,
    async vaultAddress => DeployerUtils.deployContract(
      signer,
      'Curve2PoolStrategy',
      core.controller,
      FtmAddresses._2poolCrv_TOKEN,
      vaultAddress
    ) as Promise<IStrategy>,
    core.controller,
    core.rewardToken,
    signer,
    60 * 60 * 24 * 28,
    0,
    true
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vault.address);
  await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/fantom/curve/Curve2PoolStrategy.sol:Curve2PoolStrategy', [
    core.controller,
    FtmAddresses._2poolCrv_TOKEN,
    vault.address
  ]);

  const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
  writeFileSync(`./tmp/deployed/${vaultNameWithoutPrefix}.txt`, txt, 'utf8');

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
