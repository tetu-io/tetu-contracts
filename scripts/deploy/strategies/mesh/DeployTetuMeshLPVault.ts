import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {SmartVault, SmartVault__factory} from "../../../../typechain";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {RunHelper} from "../../../utils/tools/RunHelper";
import {writeFileSync} from "fs";

const REWARDS_DURATION = 60 * 60 * 24 * 3; // 3 days
const UNDERLYING = MaticAddresses.TETU_MESH_MESH_LP;
const NAME = 'TETU_MESH_tetuMESH_LP';
const SYMBOL = 'xMESH_tetuMESH_LP';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const [proxy, logic] = await DeployerUtils.deployTetuProxyControlled(signer, "SmartVault");
  const vault = SmartVault__factory.connect(proxy.address, signer);

  await RunHelper.runAndWait(() => vault.initializeSmartVault(
    NAME,
    SYMBOL,
    core.controller,
    UNDERLYING,
    REWARDS_DURATION,
    false,
    core.psVault,
    0
  ));

  const txt = `vault: ${proxy.address}`;
  writeFileSync(`./tmp/deployed/${NAME}.txt`, txt, 'utf8');

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
  await DeployerUtils.verifyWithArgs(proxy.address, [logic.address]);
  await DeployerUtils.verifyProxy(proxy.address);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });