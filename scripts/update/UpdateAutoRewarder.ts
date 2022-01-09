import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {AutoRewarder} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const chainId = (await ethers.provider.getNetwork()).chainId;
  let logic;
  if (chainId === 137) {
    logic = await DeployerUtils.deployContract(signer, "AutoRewarder") as AutoRewarder;
  } else if (chainId === 250) {
    logic = await DeployerUtils.deployContract(signer, "AutoRewarderSideChain") as AutoRewarder;
  } else {
    throw new Error('unknown chain ' + chainId);
  }

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
