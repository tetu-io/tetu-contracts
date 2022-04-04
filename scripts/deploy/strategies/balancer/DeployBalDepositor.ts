import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {BalDepositor__factory} from "../../../../typechain";
import {RunHelper} from "../../../utils/tools/RunHelper";

// from 222 - 0x66AD90c52199fE9dc6c1f83e0513bf4CBB81451f

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const data = (await DeployerUtils.deployTetuProxyControlled(signer, "BalDepositor"));
  const ctr = BalDepositor__factory.connect(data[0].address, signer);
  await RunHelper.runAndWait(() => ctr.initialize(core.controller));

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[1].address);
  await DeployerUtils.verifyWithArgs(data[0].address, [data[1].address]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
