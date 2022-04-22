import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const gov = await DeployerUtils.getGovernance()

  const args = [gov, core.rewardToken, parseUnits('1000'), core.controller];

  const contract = await DeployerUtils.deployContract(signer, "TetuPawnShop", ...args) as TetuPawnShop;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
