import { DeployerUtils } from "../DeployerUtils";
import { ethers } from "hardhat";
import { MultiSwap } from "../../../typechain";
import { MaticAddresses } from "../../addresses/MaticAddresses";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const multiSwap = (await DeployerUtils.deployContract(
    signer,
    "MultiSwap",
    core.controller,
    tools.calculator,
    [MaticAddresses.SUSHI_FACTORY],
    [MaticAddresses.SUSHI_ROUTER]
  )) as MultiSwap;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(multiSwap.address, [
    core.controller,
    tools.calculator,
    [MaticAddresses.SUSHI_FACTORY],
    [MaticAddresses.SUSHI_ROUTER],
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
