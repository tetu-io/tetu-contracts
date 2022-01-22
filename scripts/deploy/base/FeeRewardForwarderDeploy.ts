import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { Controller } from '../../../typechain';
import { RunHelper } from '../../utils/tools/RunHelper';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const data = await DeployerUtils.deployForwarderV2(signer, core.controller);

  // if ((await ethers.provider.getNetwork()).name !== "matic") {
  //   const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  //   await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(data[0].address));
  //   await RunHelper.runAndWait(() => controller.setRewardDistribution([data[0].address], true));
  // }

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[2].address);
  await DeployerUtils.verifyWithArgs(data[0].address, [data[2].address]);
  await DeployerUtils.verifyProxy(data[0].address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
