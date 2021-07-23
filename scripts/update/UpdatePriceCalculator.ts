import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {TetuProxy} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const net = await ethers.provider.getNetwork();

  let name;
  if (net.name === 'rinkeby') {
    name = 'PriceCalculatorRinkeby';
  } else if (net.name === 'ropsten') {
    name = 'PriceCalculatorRopsten';
  } else {
    throw Error('Unknown net' + net);
  }

  const logic = await DeployerUtils.deployContract(signer, name);

  const proxy = await DeployerUtils.connectContract(signer, "TetuProxy", tools.calculator) as TetuProxy;
  await proxy.upgrade(logic.address);

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
