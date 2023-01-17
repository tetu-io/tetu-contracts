import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ZapV2} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const zap = await DeployerUtils.deployContract(signer, "ZapV2", core.controller) as ZapV2;

  await DeployerUtils.wait(10);
  await DeployerUtils.verifyWithArgs(zap.address, [core.controller]);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
