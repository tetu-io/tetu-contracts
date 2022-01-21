// noinspection DuplicatedCode

import { DeployerUtils } from "../DeployerUtils";
import { ethers } from "hardhat";
import { writeFileSync } from "fs";

export default async function main() {
  const signer = (await ethers.getSigners())[0];
  const net = (await ethers.provider.getNetwork()).name;

  let timeLock = 60 * 60 * 48;
  if (net === "rinkeby" || net === "ropsten" || net === "mumbai") {
    timeLock = 1;
  }

  const core = await DeployerUtils.deployAllCoreContracts(
    signer,
    60 * 60 * 24 * 28,
    timeLock,
    true
  );

  writeFileSync(
    "./core_addresses.txt",
    core.controller.address +
      ", // controller\n" +
      core.announcer.address +
      ", // announcer\n" +
      core.feeRewardForwarder.address +
      ", // feeRewardForwarder\n" +
      core.bookkeeper.address +
      ", // bookkeeper\n" +
      core.notifyHelper.address +
      ", // notifyHelper\n" +
      core.mintHelper.address +
      ", // mintHelper\n" +
      core.rewardToken.address +
      ", // rewardToken\n" +
      core.psVault.address +
      ", // psVault\n" +
      core.fundKeeper.address +
      ", // fundKeeper\n",
    "utf8"
  );

  await DeployerUtils.wait(5);

  // controller
  await DeployerUtils.verify(core.controllerLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.controller.address, [
    core.controllerLogic,
  ]);
  await DeployerUtils.verifyProxy(core.controller.address);

  // announcer
  await DeployerUtils.verify(core.announcerLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.announcer.address, [
    core.announcerLogic,
  ]);
  await DeployerUtils.verifyProxy(core.announcer.address);

  // forwarder
  await DeployerUtils.verifyWithArgs(core.feeRewardForwarder.address, [
    core.controller.address,
  ]);

  // bookkeeper
  await DeployerUtils.verify(core.bookkeeperLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.bookkeeper.address, [
    core.bookkeeperLogic,
  ]);
  await DeployerUtils.verifyProxy(core.bookkeeper.address);

  // notifier
  await DeployerUtils.verifyWithArgs(core.notifyHelper.address, [
    core.controller.address,
  ]);

  // minter
  await DeployerUtils.verify(core.mintHelperLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.mintHelper.address, [
    core.mintHelperLogic,
  ]);
  await DeployerUtils.verifyProxy(core.mintHelper.address);

  // reward token
  await DeployerUtils.verifyWithArgs(core.rewardToken.address, [
    core.mintHelper.address,
  ]);

  // ps
  await DeployerUtils.verify(core.psVaultLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.psVault.address, [core.psVaultLogic]);
  await DeployerUtils.verifyProxy(core.psVault.address);
  await DeployerUtils.verifyWithArgs(core.psEmptyStrategy.address, [
    core.controller.address,
    core.rewardToken.address,
    core.psVault.address,
    [],
    [core.rewardToken.address],
  ]);

  // fundKeeper
  await DeployerUtils.verify(core.fundKeeperLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.fundKeeper.address, [
    core.fundKeeperLogic,
  ]);
  await DeployerUtils.verifyProxy(core.fundKeeper.address);

  return core;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
