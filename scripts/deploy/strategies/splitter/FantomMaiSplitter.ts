import {DeployerUtils} from "../../DeployerUtils";
import {appendFileSync, mkdir} from "fs";
import {ethers} from "hardhat";
import {FtmCoreAddresses} from "../../../../addresses_core_ftm";
import {TetuProxyControlled__factory} from "../../../../typechain";
import {FtmAddresses} from "../../../addresses/FtmAddresses";

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const signer = (await ethers.getSigners())[0];
  const vaultName = 'MAI';
  const underlying = FtmAddresses.miMATIC_TOKEN;
  const vaultRt = FtmAddresses.TETU_TOKEN;

  const [vaultLogic, vault, strategy] = await DeployerUtils.deployVaultWithSplitter(vaultName,
      signer,
      FtmCoreAddresses.ADDRESSES.controller,
      underlying,
      vaultRt)

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
