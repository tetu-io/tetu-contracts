import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";
import {MaticAddresses} from "../../addresses/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const gov = await DeployerUtils.getGovernance()

  const owner = gov;
  const depositToken = MaticAddresses.TETU_TOKEN;
  const positionDepositAmount = parseUnits('0.01')
  const feeRecipient = gov;

  const args = [
    owner,
    depositToken,
    positionDepositAmount,
    feeRecipient,
  ];

  await DeployerUtils.deployContract(signer, "TetuPawnShop", ...args) as TetuPawnShop;
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
