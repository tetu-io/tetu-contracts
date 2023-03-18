import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {HardWorkResolver2__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const logic = await DeployerUtils.deployContract(signer, "HardWorkResolver2");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address);

  await RunHelper.runAndWait(() => HardWorkResolver2__factory.connect(proxy.address, signer).init(core.controller));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
