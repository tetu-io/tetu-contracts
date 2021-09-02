import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, TetuProxyGov} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const logic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;

  if ((await ethers.provider.getNetwork()).name !== "matic") {
    const proxy = await DeployerUtils.connectContract(signer, "TetuProxyGov", tools.reader) as TetuProxyGov;
    await proxy.upgrade(logic.address);
  }

  // const reader = logic.attach(proxy.address);

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
