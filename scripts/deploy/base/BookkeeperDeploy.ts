import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Bookkeeper, ContractReader, Controller} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const logic = await DeployerUtils.deployContract(signer, "Bookkeeper");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
  const bookkeeper = logic.attach(proxy.address) as Bookkeeper;
  await bookkeeper.initialize(core.controller);

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  await controller.setBookkeeper(bookkeeper.address);

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
