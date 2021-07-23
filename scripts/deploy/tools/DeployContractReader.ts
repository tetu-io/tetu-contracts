import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const logic = await DeployerUtils.deployContract(signer, "ContractReader");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxy", logic.address);
  const contractReader = logic.attach(proxy.address) as ContractReader;

  await contractReader.initialize(core.controller);
  await contractReader.setPriceCalculator(tools.calculator);

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
