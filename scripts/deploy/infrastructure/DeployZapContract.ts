import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {MultiSwap} from "../../../typechain";
import {MaticAddresses} from "../../../test/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const zapData = await DeployerUtils.deployZapContract(signer, core.controller, tools.multiSwap);

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(zapData[2].address);
  await DeployerUtils.verifyWithArgs(zapData[1].address, [zapData[2].address]);
  await DeployerUtils.verifyProxy(zapData[1].address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
