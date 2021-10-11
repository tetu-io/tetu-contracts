import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, Controller} from "../../../typechain";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];

  const controller = await DeployerUtils.connectProxy(core.controller, signer, "Controller") as Controller;
  const bookkeeper = await DeployerUtils.connectProxy(core.bookkeeper, signer, "Bookkeeper") as Bookkeeper;

  const vaults = await bookkeeper.vaults();

  for (const vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);

    const name = await vaultContract.name();

    console.log('update', name);

    // some actions

  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
