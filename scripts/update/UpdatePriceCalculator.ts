import { ethers } from "hardhat";
import { DeployerUtils } from "../deploy/DeployerUtils";
import { TetuProxyGov } from "../../typechain";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const net = await ethers.provider.getNetwork();

  const logic = await DeployerUtils.deployContract(signer, "PriceCalculator");

  if ((await ethers.provider.getNetwork()).name !== "matic") {
    const proxy = (await DeployerUtils.connectContract(
      signer,
      "TetuProxyGov",
      tools.calculator
    )) as TetuProxyGov;
    await proxy.upgrade(logic.address);
  }

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
