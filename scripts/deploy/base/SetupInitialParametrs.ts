import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {RunHelper} from "../../utils/tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);

  const deployer = '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94';
  const hw1 = '0xb70CF120fb4461F77bbB189b125131e3D5234266';
  const hw2 = '0x424198579844b0d6f13c3a6B83b9Cf987af9C545';
  const hw3 = '0xADC31a85C01aeBA202Df01adc392a7c6b8D56916';
  const hw4 = '0x9880888C8768f4507bD5793E37470343dBBfF3B6';

  // await RunHelper.runAndWait(() => core.controller.addHardWorker(deployer));
  await RunHelper.runAndWait(() => core.controller.addHardWorker(hw1));
  await RunHelper.runAndWait(() => core.controller.addHardWorker(hw2));
  await RunHelper.runAndWait(() => core.controller.addHardWorker(hw3));
  await RunHelper.runAndWait(() => core.controller.addHardWorker(hw4));

  await RunHelper.runAndWait(() => core.controller.setRewardDistribution(
    [deployer, hw1, hw2, hw3, hw4],
    true
  ));

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
