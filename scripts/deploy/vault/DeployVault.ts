import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {SmartVault, SmartVault__factory} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {MaticAddresses} from "../../addresses/MaticAddresses";


const SYMBOL = 'xDystTETU-USDPlus';
const UNDERLYING = MaticAddresses.DYSTOPIA_TETU_USDPlus;
const DURATION = 60 * 60 * 24 * 7;

async function main() {
  const signer = (await ethers.getSigners())[0];

  const core = await DeployerUtils.getCoreAddresses();

  const logic = await DeployerUtils.deployContract(signer, "SmartVault");
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);

  await RunHelper.runAndWait(() => SmartVault__factory.connect(proxy.address, signer).initializeSmartVault(
    SYMBOL,
    SYMBOL,
    core.controller,
    UNDERLYING,
    DURATION,
    false,
    core.psVault,
    0
  ));

  await DeployerUtils.wait(5);

  await DeployerUtils.verify(logic.address);
  await DeployerUtils.verifyWithArgs(proxy.address, [logic.address]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
