import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, SmartVault} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const bookkeeper = await DeployerUtils.connectContract(signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const vaults = await bookkeeper.vaults();

  for (let vault of vaults) {
    const currentVault = await DeployerUtils.connectVault(vault, signer) as SmartVault;
    await currentVault.finalizeUpgrade();
  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
