import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Controller, FundKeeper} from "../../../typechain";
import {RunHelper} from "../../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tokens = await DeployerUtils.getTokenAddresses();

  const logic = await DeployerUtils.deployContract(signer, "FundKeeper");
  const proxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", logic.address);
  const fundKeeper = logic.attach(proxy.address) as FundKeeper;
  await fundKeeper.initialize(core.controller);

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  await RunHelper.runAndWait(() => controller.setFund(fundKeeper.address));
  await RunHelper.runAndWait(() => controller.setFundToken(tokens.get('usdc') as string));

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
  await DeployerUtils.verifyWithArgs(proxy.address, [logic.address]);
  await DeployerUtils.verifyProxy(proxy.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
