import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";

async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, "ZapV2Helper");
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
