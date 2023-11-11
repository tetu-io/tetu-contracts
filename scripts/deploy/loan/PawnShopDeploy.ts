import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {parseUnits} from "ethers/lib/utils";
import {MaticAddresses} from "../../addresses/MaticAddresses";

// const DEPOSIT_TOKEN = MaticAddresses.TETU_TOKEN;
const DEPOSIT_TOKEN = '0xbE3c35a0abaA1707308480224D71D94F75b458D1';
const DEPOSIT_FEE = parseUnits('0.1')
const GOV = '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'
// const GOV = '0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B'
// const FEE_RECIPIENT = '0x9Cc199D4353b5FB3e6C8EEBC99f5139e0d8eA06b'
const FEE_RECIPIENT = GOV

async function main() {
  const signer = (await ethers.getSigners())[0];

  const owner = GOV;
  const feeRecipient = FEE_RECIPIENT;

  const args = [
    owner,
    DEPOSIT_TOKEN,
    DEPOSIT_FEE,
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
