// noinspection DuplicatedCode

import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {Bookkeeper, Controller, NoopStrategy, SmartVault} from "../../../typechain";
import {RunHelper} from "../../utils/RunHelper";
import {MaticAddresses} from "../../../test/MaticAddresses";


export default async function main() {
  const signer = (await ethers.getSigners())[0];
  const net = (await ethers.provider.getNetwork()).name;

  let timeLock = 60 * 60 * 48;
  if (net === 'rinkeby' || net === 'ropsten' || net === 'mumbai') {
    timeLock = 1;
  }

  const rewardToken = MaticAddresses.ZERO_ADDRESS;
  const wait = true;
  const psRewardDuration = 60 * 60 * 24 * 28;

  // ************** CONTROLLER **********
  const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
  const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
  const controller = controllerLogic.attach(controllerProxy.address) as Controller;
  await controller.initialize();

  // ************ ANNOUNCER **********
  const announcerData = await DeployerUtils.deployAnnouncer(signer, controller.address, timeLock);

  // ************ VAULT CONTROLLER **********
  const vaultControllerData = await DeployerUtils.deployVaultController(signer, controller.address);

  // ********* FEE FORWARDER *********
  const feeRewardForwarderData = await DeployerUtils.deployFeeForwarder(signer, controller.address);

  // ********** BOOKKEEPER **********
  const bookkeeperLogic = await DeployerUtils.deployContract(signer, "Bookkeeper");
  const bookkeeperProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", bookkeeperLogic.address);
  const bookkeeper = bookkeeperLogic.attach(bookkeeperProxy.address) as Bookkeeper;
  await bookkeeper.initialize(controller.address);

  // ********** FUND KEEPER **************
  const fundKeeperData = await DeployerUtils.deployFundKeeper(signer, controller.address);

  // ****** PS ********
  const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
  const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
  const psVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
  const psEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
    controller.address, rewardToken, psVault.address, [], [rewardToken], 1) as NoopStrategy;

  // !########### INIT ##############
  await RunHelper.runAndWait(() => psVault.initializeSmartVault(
    "TETU_PS",
    "xTETU",
    controller.address,
    rewardToken,
    psRewardDuration,
    false,
    MaticAddresses.ZERO_ADDRESS
  ), true, wait);

  // ******* SETUP CONTROLLER ********
  await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(feeRewardForwarderData[0].address), true, wait);
  await RunHelper.runAndWait(() => controller.setBookkeeper(bookkeeper.address), true, wait);
  await RunHelper.runAndWait(() => controller.setRewardToken(rewardToken), true, wait);
  await RunHelper.runAndWait(() => controller.setPsVault(psVault.address), true, wait);
  await RunHelper.runAndWait(() => controller.setFund(fundKeeperData[0].address), true, wait);
  await RunHelper.runAndWait(() => controller.setAnnouncer(announcerData[0].address), true, wait);
  await RunHelper.runAndWait(() => controller.setVaultController(vaultControllerData[0].address), true, wait);

  try {
    const tokens = await DeployerUtils.getTokenAddresses()
    await RunHelper.runAndWait(() => controller.setFundToken(tokens.get('usdc') as string), true, wait);
  } catch (e) {
    console.error('USDC token not defined for network, need to setup Fund token later');
  }
  await RunHelper.runAndWait(() => controller.setRewardDistribution(
    [
      feeRewardForwarderData[0].address
    ], true), true, wait);

  // need to add after adding bookkeeper
  await RunHelper.runAndWait(() =>
      controller.addVaultAndStrategy(psVault.address, psEmptyStrategy.address),
    true, wait);

  writeFileSync('./core_addresses.txt',
    controller.address + ', // controller\n' +
    announcerData[0].address + ', // announcer\n' +
    feeRewardForwarderData[0].address + ', // feeRewardForwarder\n' +
    bookkeeper.address + ', // bookkeeper\n' +
    rewardToken + ', // rewardToken\n' +
    psVault.address + ', // psVault\n' +
    fundKeeperData[0].address + ', // fundKeeper\n'
    , 'utf8');

  await DeployerUtils.wait(5);

  // controller
  await DeployerUtils.verify(controllerLogic.address);
  await DeployerUtils.verifyWithArgs(controller.address, [controllerLogic.address]);
  await DeployerUtils.verifyProxy(controller.address);

  // announcer
  await DeployerUtils.verify(announcerData[1].address);
  await DeployerUtils.verifyWithArgs(announcerData[0].address, [announcerData[1].address]);
  await DeployerUtils.verifyProxy(announcerData[0].address);

  // forwarder
  await DeployerUtils.verify(feeRewardForwarderData[1].address);
  await DeployerUtils.verifyWithArgs(feeRewardForwarderData[0].address, [feeRewardForwarderData[1].address]);
  await DeployerUtils.verifyProxy(feeRewardForwarderData[0].address);

  // bookkeeper
  await DeployerUtils.verify(bookkeeperLogic.address);
  await DeployerUtils.verifyWithArgs(bookkeeper.address, [bookkeeperLogic.address]);
  await DeployerUtils.verifyProxy(bookkeeper.address);

  // ps
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(psVault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(psVault.address);
  await DeployerUtils.verifyWithArgs(psEmptyStrategy.address,
    [controller.address, rewardToken, psVault.address, [], [rewardToken]]);

  // fundKeeper
  await DeployerUtils.verify(fundKeeperData[1].address);
  await DeployerUtils.verifyWithArgs(fundKeeperData[0].address, [fundKeeperData[1].address]);
  await DeployerUtils.verifyProxy(fundKeeperData[0].address);

  await DeployerUtils.verify(vaultControllerData[1].address);
  await DeployerUtils.verifyWithArgs(vaultControllerData[0].address, [vaultControllerData[1].address]);
  await DeployerUtils.verifyProxy(vaultControllerData[0].address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
