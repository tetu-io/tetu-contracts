import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MultiSwap2} from "../../../typechain";
import {MaticAddresses} from "../../addresses/MaticAddresses";

// Latest:  (with SOR support)
// Prev  : 0x6dB6CeA8BB997525164a8960d74143685b0a00F7

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const networkToken = await DeployerUtils.getNetworkTokenAddress();

  const contract = await DeployerUtils.deployContract(
      signer, "MultiSwap2",
      core.controller,
      networkToken,
      MaticAddresses.BALANCER_VAULT) as MultiSwap2;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
