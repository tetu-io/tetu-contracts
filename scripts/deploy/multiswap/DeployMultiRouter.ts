import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MultiSwap2} from "../../../typechain";

// Latest: 0x6dB6CeA8BB997525164a8960d74143685b0a00F7 (with loadPairReserves)
// Prev  : 0xfD965c24c9b9B33802d6064549CC4d0b9A604786

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const contract = await DeployerUtils.deployContract(signer, "MultiSwap2") as MultiSwap2;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address); // TODO why address is wrong? Fix address and verification
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
