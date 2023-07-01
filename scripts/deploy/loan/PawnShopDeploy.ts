import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";
import {MaticAddresses} from "../../addresses/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const gov = await DeployerUtils.getGovernance()

  const owner = gov;
  const depositToken = '0x33D27E8005EC4eA0fDa37Aa07FE7Bf29480cc5E2';
  const positionDepositAmount = parseUnits('1')
  const feeRecipient = gov;

  const args = [
    owner,
    depositToken,
    positionDepositAmount,
    feeRecipient,
  ];

  const ctr = await DeployerUtils.deployContract(signer, "TetuPawnShop", ...args) as TetuPawnShop;
  console.log("TetuPawnShop deployed at", ctr.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
