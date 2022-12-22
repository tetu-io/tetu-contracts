import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ZapTetuBal} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const zap = await DeployerUtils.deployContract(signer, "ZapTetuBal", core.controller) as ZapTetuBal;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(zap.address, [core.controller]);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
