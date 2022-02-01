import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {TetuProxyControlled__factory} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  // ** CONFIG
  const vaultName = 'WMATIC';
  const controller = core.controller;
  const underlying = MaticAddresses.WMATIC_TOKEN;
  const vaultRt = MaticAddresses.TETU_TOKEN;
  // *****************************

  const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultWithSplitter(
      vaultName,
      signer,
      controller,
      underlying,
      vaultRt
  );

  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const txt = `${vaultName}:     vault: ${vault.address}     strategy: ${strategy.address}\n`;
  appendFileSync(`./tmp/deployed/vaults.txt`, txt, 'utf8');

  const splitterLogic = await TetuProxyControlled__factory.connect(strategy.address, signer).implementation();

  await DeployerUtils.wait(5);

  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vault.address);

  await DeployerUtils.verify(splitterLogic);
  await DeployerUtils.verifyWithArgs(strategy.address, [splitterLogic]);
  await DeployerUtils.verifyProxy(strategy.address);
}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
