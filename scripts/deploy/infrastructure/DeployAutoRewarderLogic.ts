import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {utils} from "ethers";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const data = await DeployerUtils.deployContract(signer, "AutoRewarder")

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
