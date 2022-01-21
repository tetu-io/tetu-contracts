import { DeployerUtils } from "../../DeployerUtils";
import { ethers } from "hardhat";
import { MockWETH } from "../../../../typechain";
import { utils } from "ethers";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const contract = (await DeployerUtils.deployContract(
    signer,
    "MockWETH"
  )) as MockWETH;
  await contract.mint(signer.address, utils.parseUnits("10000000"));

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
