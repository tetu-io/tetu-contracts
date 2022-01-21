import {ethers} from "hardhat";
import {ContractReader, IStrategy} from "../../../../typechain";
import {writeFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
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

  const vaultNameWithoutPrefix = `CRV_ATC3`;

  if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
    console.log('Strategy already exist', vaultNameWithoutPrefix);
  }

  const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultAndStrategy(
    vaultNameWithoutPrefix,
    async vaultAddress => DeployerUtils.deployContract(
      signer,
      'CurveATriCrypto3Strategy',
      core.controller,
      MaticAddresses.USD_BTC_ETH_CRV_TOKEN,
      vaultAddress
    ) as Promise<IStrategy>,
    core.controller,
    core.psVault,
    signer,
    60 * 60 * 24 * 28,
    0
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vault.address);
  await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/curve/CurveATriCrypto3Strategy.sol:CurveATriCrypto3Strategy', [
    core.controller,
    MaticAddresses.USD_BTC_ETH_CRV_TOKEN,
    vault.address
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
