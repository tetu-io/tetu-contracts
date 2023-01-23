import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, PolygonBridgeSender__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const logic = await DeployerUtils.deployContract(signer, "PolygonBridgeSender");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address);
  const contractReader = PolygonBridgeSender__factory.connect(proxy.address, signer);

  await RunHelper.runAndWait(() => contractReader.initialize(core.controller));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
