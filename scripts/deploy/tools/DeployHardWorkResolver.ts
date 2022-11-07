import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  await DeployerUtils.deployContract(signer, "HardWorkResolver", core.controller, core.bookkeeper);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
