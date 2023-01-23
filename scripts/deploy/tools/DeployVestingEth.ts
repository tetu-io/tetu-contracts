import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, PolygonBridgeSender__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {EthAddresses} from "../../addresses/EthAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const vesting = 60 * 60 * 24 * 365;
  const cliff = 60 * 60 * 24 * 180;
  const recipient = '0x5E427A2BD4Da38234C6EBAD7A64d7d0007D02382';

  await DeployerUtils.deployContract(signer, "Vesting", EthAddresses.TETU_TOKEN, vesting, cliff, recipient);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
