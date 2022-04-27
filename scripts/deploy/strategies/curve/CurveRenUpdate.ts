import {ethers} from "hardhat";
import {ContractReader, IStrategy, SmartVault} from "../../../../typechain";
import {appendFileSync, mkdir, writeFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAddress of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAddress), vAddress);
  }

  const vaultNameWithoutPrefix = `CRV_REN`;

  const vaultAddress = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);
  if (!vaultAddress) {
    console.log('Vault not found!', vaultNameWithoutPrefix);
    return;
  }

  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;

  if (!(await vCtr.active())) {
    console.log('vault not active', vaultAddress)
    return;
  }

  const strategy = await DeployerUtils.deployContract(
    signer,
    'CurveRenStrategy',
    core.controller,
    MaticAddresses.BTCCRV_TOKEN,
    vaultAddress
  ) as IStrategy;

  const txt = `${vaultNameWithoutPrefix}:     vault: ${vaultAddress}     strategy: ${strategy.address}\n`;
  appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

  if ((await ethers.provider.getNetwork()).name !== "hardhat") {
    await DeployerUtils.wait(5);
    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy', [
      core.controller,
      MaticAddresses.BTCCRV_TOKEN,
      vaultAddress
    ]);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
