import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Controller, FeeRewardForwarder} from "../../../typechain";
import {RunHelper} from "../../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const feeRewardForwarder = await DeployerUtils.deployContract(signer, "FeeRewardForwarder", core.controller) as FeeRewardForwarder;

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(feeRewardForwarder.address));

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(feeRewardForwarder.address, [core.controller]);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
