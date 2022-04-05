import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {FundKeeper} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const logic = await DeployerUtils.deployContract(signer, "FundKeeper");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
  const fundKeeper = logic.attach(proxy.address) as FundKeeper;
  await fundKeeper.initialize(core.controller);

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
