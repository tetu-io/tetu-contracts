// noinspection DuplicatedCode

import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader} from "../../../typechain";
import {writeFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.deployAllCoreContracts(signer, 60 * 60 * 24 * 28, true);

  await writeFileSync('./infos.json', JSON.stringify(core), 'utf8');

  await DeployerUtils.wait(5);

  // controller
  await DeployerUtils.verify(core.controllerLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.controller.address, [core.controllerLogic]);
  await DeployerUtils.verifyProxy(core.controller.address);

  // forwarder
  await DeployerUtils.verifyWithArgs(core.feeRewardForwarder.address, [core.controller.address]);

  // bookkeeper
  await DeployerUtils.verify(core.bookkeeperLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.bookkeeper.address, [core.bookkeeperLogic]);
  await DeployerUtils.verifyProxy(core.bookkeeper.address);

  // notifier
  await DeployerUtils.verifyWithArgs(core.notifyHelper.address, [core.controller.address]);

  // minter
  await DeployerUtils.verifyWithArgs(core.mintHelper.address,
      [core.controller.address, [signer.address], [3000]]);

  // reward token
  await DeployerUtils.verifyWithArgs(core.rewardToken.address, [core.mintHelper.address]);

  //ps
  await DeployerUtils.verify(core.psVaultLogic);
  await DeployerUtils.wait(1);
  await DeployerUtils.verifyWithArgs(core.psVault.address, [core.psVaultLogic]);
  await DeployerUtils.verifyProxy(core.psVault.address);
  await DeployerUtils.verifyWithArgs(core.psEmptyStrategy.address,
      [core.controller.address, core.rewardToken.address, core.psVault.address, [], [core.rewardToken.address]]);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
