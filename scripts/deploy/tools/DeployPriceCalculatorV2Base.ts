import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const calculator = await DeployerUtils.deployPriceCalculatorV2Base(signer);
  console.log(`PriceCalculatorV2Base deployed: ${calculator.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
