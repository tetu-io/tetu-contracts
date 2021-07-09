import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, SmartVault, VaultProxy} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const bookkeeper = await DeployerUtils.connectContract(signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const vaults = await bookkeeper.vaults();

  const newVaultLogics = [];
  for (let vault of vaults) {
    const logic = await DeployerUtils.deployContract(signer, "SmartVault") as SmartVault;
    newVaultLogics.push(logic.address);
    console.log('new logic', logic.address, vault);
    const currentVault = await DeployerUtils.connectVault(vault, signer) as SmartVault;
    await currentVault.scheduleUpgrade(logic.address);
  }

  await DeployerUtils.wait(5);
  for (let logic of newVaultLogics) {
    await DeployerUtils.verify(logic);
  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
