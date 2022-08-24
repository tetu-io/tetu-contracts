import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MultiSwap2} from "../../../typechain";
import {MaticAddresses} from "../../addresses/MaticAddresses";

// Latest: 0x11637b94Dfab4f102c21fDe9E34915Bb5F766A8a  (Network Token In/Out)
// Prev  : 0xB6A771eC805a6e69711d822577D4d0516da51378  (platform fee in swaps)
// Prev  : 0x4b16B97720968609f1CC41D9F79DE589e24fc097  (Dex detection fix)
// Prev  : 0x05f14e91f8a0aEe60dCeC853a2e5F03ae8A02620  (Dystopia support)
// Prev  : 0x78043B892E7b3bADdF1A9488129a1063a0aCF7E5  (with SOR support, slippage fixed)

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const networkToken = await DeployerUtils.getNetworkTokenAddress();
  const args = [
      core.controller,
      networkToken,
      MaticAddresses.BALANCER_VAULT,
      MaticAddresses.TETU_SWAP_FACTORY
  ];

  const contract = await DeployerUtils.deployContract(
      signer,
      "MultiSwap2",
      ...args,
  ) as MultiSwap2;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
