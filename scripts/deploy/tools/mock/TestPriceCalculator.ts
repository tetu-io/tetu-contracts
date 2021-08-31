import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {Controller, PriceCalculator, TetuProxyGov} from "../../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const net = await ethers.provider.getNetwork();

  const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
  const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
  const controller = controllerLogic.attach(controllerProxy.address) as Controller;
  await controller.initialize();

  let data: [PriceCalculator, TetuProxyGov, PriceCalculator];
  if (net.name === "matic") {
    // @ts-ignore
    data = await DeployerUtils.deployPriceCalculatorMatic(signer, controller.address, true);
  } else {
    // @ts-ignore
    data = await DeployerUtils.deployPriceCalculatorTestNet(signer, controller.address);
  }

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[2].address);
  await DeployerUtils.verifyWithArgs(data[1].address, [data[2].address]);
  await DeployerUtils.verifyProxy(data[1].address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
