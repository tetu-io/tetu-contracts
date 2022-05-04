import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {DepositHelper} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const contract = await DeployerUtils.deployContract(signer, "DepositHelper") as DepositHelper;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);

  // TODO call from gov: controller.changeWhiteListStatus([depositHelper.address], true);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
