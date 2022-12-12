import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {PriceCalculator, TetuProxyGov} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  // const signer = await DeployerUtils.impersonate();
  const core = await DeployerUtils.getCoreAddresses();
  const net = await ethers.provider.getNetwork();

  let data: [PriceCalculator, TetuProxyGov, PriceCalculator];
  if (net.name === "matic") {
    data = await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller, true);
  } else if (net.chainId === 250) {
    data = await DeployerUtils.deployPriceCalculatorFantom(signer, core.controller, true);
  } else if (net.chainId === 56) {
    data = await DeployerUtils.deployPriceCalculatorBsc(signer, core.controller, true);
  } else if (net.chainId === 1) {
    data = await DeployerUtils.deployPriceCalculatorEth(signer, core.controller, true);
  } else {
    throw Error("Incorrect network selected");
  }

  // await DeployerUtils.wait(5);
  // await DeployerUtils.verify(data[2].address);
  // await DeployerUtils.verifyWithArgs(data[1].address, [data[2].address]);
  // await DeployerUtils.verifyProxy(data[1].address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
