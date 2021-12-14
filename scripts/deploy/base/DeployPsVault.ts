// noinspection DuplicatedCode

import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Controller, NoopStrategy, SmartVault} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {Misc} from "../../utils/tools/Misc";


export default async function main() {
  const signer = (await ethers.getSigners())[0];

  const core = await DeployerUtils.getCoreAddresses();
  const net = (await ethers.provider.getNetwork()).name;

  const controller = await DeployerUtils.connectInterface(signer, 'Controller', core.controller) as Controller;


  // const rewardToken = MaticAddresses.ZERO_ADDRESS;
  const wait = true;
  const psRewardDuration = 60 * 60 * 24 * 28;


  // ****** PS ********
  const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
  const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
  const psVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
  const psEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
    core.controller, core.rewardToken, psVault.address, [], [core.rewardToken], 1) as NoopStrategy;

  await RunHelper.runAndWait(() => psVault.initializeSmartVault(
    "TETU_PS",
    "xTETU",
    core.controller,
    core.rewardToken,
    psRewardDuration,
    false,
    Misc.ZERO_ADDRESS,
    0
  ), true, wait);
  await RunHelper.runAndWait(() => controller.setRewardToken(core.rewardToken), true, wait);
  await RunHelper.runAndWait(() => controller.setPsVault(psVault.address), true, wait);

  // need to add after adding bookkeeper
  await RunHelper.runAndWait(() =>
      controller.addVaultAndStrategy(psVault.address, psEmptyStrategy.address),
    true, wait);

  // ps
  await DeployerUtils.wait(5);
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(psVault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(psVault.address);
  await DeployerUtils.verifyWithArgs(psEmptyStrategy.address,
    [core.controller, core.rewardToken, psVault.address, [], [core.rewardToken], 1]);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
