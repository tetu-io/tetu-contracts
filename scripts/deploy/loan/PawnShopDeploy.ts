import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";
import {RunHelper} from "../../utils/tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const gov = await DeployerUtils.getGovernance()

  const owner = gov;
  const depositToken = '0x0EFc2D2D054383462F2cD72eA2526Ef7687E1016'
  const positionDepositAmount = parseUnits('1')
  const feeRecipient = gov;

  const args = [
    owner,
    depositToken,
    positionDepositAmount,
    feeRecipient,
  ];

  const contract = await DeployerUtils.deployContract(signer, "TetuPawnShop", ...args) as TetuPawnShop;

  // await RunHelper.runAndWait(() => contract.setPlatformFee(500));

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
