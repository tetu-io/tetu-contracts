import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReaderV2, ContractReaderV2__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {BaseAddresses} from "../../addresses/BaseAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const logic = await DeployerUtils.deployContract(signer, "ContractReaderV2");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address);
  const contractReader = ContractReaderV2__factory.connect(proxy.address, signer);

  await RunHelper.runAndWait(() => contractReader.initialize(BaseAddresses.PRICE_CALCULATOR));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
