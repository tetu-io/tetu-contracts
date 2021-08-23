import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer, Controller} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const net = await ethers.provider.getNetwork();

  const controller = await DeployerUtils.connectInterface(signer, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(signer, 'Announcer', core.announcer) as Announcer;

  // await RunHelper.runAndWait(() =>announcer.closeAnnounce(14, '0xe82aef9f146dd13ddedc65d1892d7fc7d42b8dc902313cae69be5eea11358b28', '0x00aEC86D06B4336bCA967b42724E3596d3622313'));

  const logic = await DeployerUtils.deployContract(signer, "Controller") as Controller;

  if ((await ethers.provider.getNetwork()).name !== "matic") {
    await RunHelper.runAndWait(() => announcer.announceTetuProxyUpgrade(core.controller, logic.address));
    await RunHelper.runAndWait(() => controller.upgradeTetuProxy(core.controller, logic.address));
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
