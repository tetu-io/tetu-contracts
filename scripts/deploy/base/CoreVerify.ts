// noinspection DuplicatedCode

import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';

export default async function main() {
  const signer = (await ethers.getSigners())[0];

  const core = await DeployerUtils.getCoreAddresses();

  const controllerLogic = '0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F';
  const controller = core.controller;

  const announcerData = [
    core.announcer,
    '0xdF837f0327Bbf85b066c400f17b2B2727F94cb2f',
  ];

  const feeRewardForwarderData = [
    core.feeRewardForwarder,
    '0x0A0846c978a56D6ea9D2602eeb8f977B21F3207F',
  ];

  const bookkeeperLogic = '0x7AD5935EA295c4E743e4f2f5B4CDA951f41223c2';
  const bookkeeper = core.bookkeeper;

  const fundKeeperData = [
    core.fundKeeper,
    '0x2A3df2a428EB74B241Cf1d3374Fb07983c7059F3',
  ];

  const vaultControllerData = [
    core.vaultController,
    '0x35B0329118790B8c8FC36262812D92a4923C6795',
  ];

  // controller
  await DeployerUtils.verify(controllerLogic);
  await DeployerUtils.verifyWithArgs(controller, [controllerLogic]);
  await DeployerUtils.verifyProxy(controller);

  // announcer
  await DeployerUtils.verify(announcerData[1]);
  await DeployerUtils.verifyWithArgs(announcerData[0], [announcerData[1]]);
  await DeployerUtils.verifyProxy(announcerData[0]);

  // forwarder
  await DeployerUtils.verify(feeRewardForwarderData[1]);
  await DeployerUtils.verifyWithArgs(feeRewardForwarderData[0], [
    feeRewardForwarderData[1],
  ]);
  await DeployerUtils.verifyProxy(feeRewardForwarderData[0]);

  // bookkeeper
  await DeployerUtils.verify(bookkeeperLogic);
  await DeployerUtils.verifyWithArgs(bookkeeper, [bookkeeperLogic]);
  await DeployerUtils.verifyProxy(bookkeeper);

  // fundKeeper
  await DeployerUtils.verify(fundKeeperData[1]);
  await DeployerUtils.verifyWithArgs(fundKeeperData[0], [fundKeeperData[1]]);
  await DeployerUtils.verifyProxy(fundKeeperData[0]);

  await DeployerUtils.verify(vaultControllerData[1]);
  await DeployerUtils.verifyWithArgs(vaultControllerData[0], [
    vaultControllerData[1],
  ]);
  await DeployerUtils.verifyProxy(vaultControllerData[0]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
