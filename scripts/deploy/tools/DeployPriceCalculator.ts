import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {GovernmentUpdatedProxy} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const net = await ethers.provider.getNetwork();

  let proxy: GovernmentUpdatedProxy;
  if (net.name === "matic") {
    // @ts-ignore
    proxy = await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller) as GovernmentUpdatedProxy;
  } else {
    // @ts-ignore
    proxy = await DeployerUtils.deployPriceCalculatorTestNet(signer, core.controller) as GovernmentUpdatedProxy;
  }

  const logic = await proxy.implementation();

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic);
  await DeployerUtils.verifyWithArgs(proxy.address, [logic]);
  await DeployerUtils.verifyProxy(proxy.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
