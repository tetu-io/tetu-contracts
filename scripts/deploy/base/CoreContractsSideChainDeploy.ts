// noinspection DuplicatedCode

import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {Bookkeeper, Controller} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";

const TIME_LOCK = 60 * 60 * 16;

async function main() {
  const signer = (await ethers.getSigners())[0];


  // ************** CONTROLLER **********
  const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
  const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
  const controller = controllerLogic.attach(controllerProxy.address) as Controller;
  await RunHelper.runAndWait(() => controller.initialize());

  // ************ ANNOUNCER **********
  const announcerData = await DeployerUtils.deployAnnouncer(signer, controller.address, TIME_LOCK);

  // ************ VAULT CONTROLLER **********
  const vaultControllerData = await DeployerUtils.deployVaultController(signer, controller.address);

  // ********* FEE FORWARDER *********
  const feeRewardForwarderData = await DeployerUtils.deployForwarderV2(signer, controller.address);

  // ********** BOOKKEEPER **********
  const bookkeeperLogic = await DeployerUtils.deployContract(signer, "Bookkeeper");
  const bookkeeperProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", bookkeeperLogic.address);
  const bookkeeper = bookkeeperLogic.attach(bookkeeperProxy.address) as Bookkeeper;
  await RunHelper.runAndWait(() => bookkeeper.initialize(controller.address));

  // ********** FUND KEEPER **************
  const fundKeeperData = await DeployerUtils.deployFundKeeper(signer, controller.address);

  // ******* SETUP CONTROLLER ********
  await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(feeRewardForwarderData[0].address));
  await RunHelper.runAndWait(() => controller.setBookkeeper(bookkeeper.address));
  await RunHelper.runAndWait(() => controller.setFund(fundKeeperData[0].address));
  await RunHelper.runAndWait(() => controller.setAnnouncer(announcerData[0].address));
  await RunHelper.runAndWait(() => controller.setVaultController(vaultControllerData[0].address));

  const tokens = await DeployerUtils.getTokenAddresses()
  await RunHelper.runAndWait(() => controller.setFundToken(tokens.get('usdc') as string));
  await RunHelper.runAndWait(() => controller.setRewardDistribution(
    [
      feeRewardForwarderData[0].address
    ], true));

  writeFileSync('./core_addresses.txt',
    controller.address + ', // controller\n' +
    announcerData[0].address + ', // announcer\n' +
    feeRewardForwarderData[0].address + ', // feeRewardForwarder\n' +
    bookkeeper.address + ', // bookkeeper\n' +
    ', // rewardToken\n' +
    ', // psVault\n' +
    fundKeeperData[0].address + ', // fundKeeper\n' +
    vaultControllerData[0].address + ', // vault controller\n'
    , 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
