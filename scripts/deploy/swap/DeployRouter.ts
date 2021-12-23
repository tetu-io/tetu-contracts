import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {TetuSwapRouter} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const networkToken = await DeployerUtils.getNetworkTokenAddress();
  const contract = await DeployerUtils.deployContract(signer, "TetuSwapRouter", core.swapFactory, networkToken) as TetuSwapRouter;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, [core.swapFactory, networkToken]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
