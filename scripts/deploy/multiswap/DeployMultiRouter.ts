import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MultiSwap2} from "../../../typechain";
import {MaticAddresses} from "../../addresses/MaticAddresses";

// Latest: 0xABb67857ad54d5dDebd4280821833611a8C57D14  (with SOR support, slippage fixed)
// Prev  : 0x8b56D66cCbc34DAd3e8ae214b9aA2BF752dF1041

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const networkToken = await DeployerUtils.getNetworkTokenAddress();
  const args = [
      core.controller,
      networkToken,
      MaticAddresses.BALANCER_VAULT
  ]
  const contract = await DeployerUtils.deployContract(
      signer, "MultiSwap2",
      ...args) as MultiSwap2;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
