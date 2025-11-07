import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";

const DEPOSIT_TOKEN = '0x6B2e0fACD2F2A8f407aC591067Ac06b5d29247E4';
const DEPOSIT_FEE = parseUnits('1')
const GOV = '0xA88FDfbdcD728903C2f85F973F7deFEdcD517530'
const FEE_RECIPIENT = '0x6ce857d3037e87465b003aCbA264DDF2Cec6D5E4' // controller

async function main() {
  const signer = (await ethers.getSigners())[0];

  const args = [
    GOV,
    DEPOSIT_TOKEN,
    DEPOSIT_FEE,
    FEE_RECIPIENT,
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
