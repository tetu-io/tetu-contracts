import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ZapTetuBalHelper} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const zap = await DeployerUtils.deployContract(signer, "ZapTetuBalHelper") as ZapTetuBalHelper;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(zap.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
