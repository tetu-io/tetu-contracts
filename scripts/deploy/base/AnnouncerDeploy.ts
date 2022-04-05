import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const data = await DeployerUtils.deployAnnouncer(signer, core.controller, 60 * 60 * 48);


  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[2].address);
  await DeployerUtils.verifyWithArgs(data[0].address, [data[2].address]);
  await DeployerUtils.verifyProxy(data[0].address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
