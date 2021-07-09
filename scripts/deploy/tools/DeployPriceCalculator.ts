import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {PriceCalculatorMatic, PriceCalculatorRopsten} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const net = await ethers.provider.getNetwork();

  let logic;
  if (net.name === "ropsten") {
    logic = await DeployerUtils.deployContract(signer, "PriceCalculatorRopsten");
  } else if (net.name === "matic") {
    logic = await DeployerUtils.deployContract(signer, "PriceCalculatorMatic");
  }  else if (net.name === "rinkeby") {
    logic = await DeployerUtils.deployContract(signer, "PriceCalculatorRinkeby");
  } else {
    console.log('no calculator for net', net.name);
    return;
  }
  const proxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", logic.address);
  let contract = logic.attach(proxy.address) as PriceCalculatorMatic;;
  await contract.initialize(core.controller);

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
