import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MultiRouter} from "../../../typechain";

// Latest: 0xfD965c24c9b9B33802d6064549CC4d0b9A604786

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const contract = await DeployerUtils.deployContract(signer, "MultiRouter") as MultiRouter;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address); // TODO why address is wrong? Fix address and verification
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
