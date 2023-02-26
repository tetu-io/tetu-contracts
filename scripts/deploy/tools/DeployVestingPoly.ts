import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, PolygonBridgeSender__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {MaticAddresses} from "../../addresses/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const vesting = 60 * 60 * 24 * 365 * 2;
  const cliff = 0;

  await DeployerUtils.deployContract(signer, "Vesting", MaticAddresses.TETU_TOKEN, vesting, cliff, MaticAddresses.GOV_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
