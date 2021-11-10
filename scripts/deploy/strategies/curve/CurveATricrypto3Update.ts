import {ethers} from "hardhat";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {MaticAddresses} from "../../../../test/MaticAddresses";

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
  for (const vaultAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vaultAdr), vaultAdr);
  }

  const vaultNameWithoutPrefix = `CRV_ATC3`;

  const vAdr = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);

  if (!vAdr) {
    console.log('Vault not found!', vaultNameWithoutPrefix);
    return;
  }

  const strategy = await DeployerUtils.deployContract(
    signer,
    'CurveATriCrypto3Strategy',
    core.controller,
    MaticAddresses.USD_BTC_ETH_CRV_TOKEN,
    vAdr
  ) as IStrategy;

  const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
  appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');


  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/curve/CurveATriCrypto3Strategy.sol:CurveATriCrypto3Strategy', [
    core.controller,
    MaticAddresses.USD_BTC_ETH_CRV_TOKEN,
    vAdr
  ]);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
