import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  await DeployerUtils.deployContract(signer, "TetuRewardRelayer", core.rewardToken, core.controller);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
