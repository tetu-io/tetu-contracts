import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {writeFileSync} from "fs";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

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

  const vaultNameWithoutPrefix = `miFARM`;

  if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
    console.log('Strategy already exist', vaultNameWithoutPrefix);
  }

  const UNDERLYING = MaticAddresses.miFARM_TOKEN;

  const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultAndStrategy(
    vaultNameWithoutPrefix,
    (vaultAddress) => {
      const args = [
        core.controller, // _controller
        UNDERLYING, // _underlying
        vaultAddress, // _vault
        [], // __rewardTokens
        [UNDERLYING], // __assets
        17, // __platform
      ];
      return DeployerUtils.deployContract(
        signer,
        'NoopStrategy',
        ...args
      ) as Promise<IStrategy>;
    },
    core.controller,
    core.psVault,
    signer,
    60 * 60 * 24 * 28,
    true
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vault.address);
  await DeployerUtils.verifyWithArgs(strategy.address, [
    core.controller,
    UNDERLYING,
    vault.address,
    [], // __rewardTokens
    [UNDERLYING], // __assets
    17, // __platform
  ]);

  const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
  writeFileSync(`./tmp/${vaultNameWithoutPrefix}.txt`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
