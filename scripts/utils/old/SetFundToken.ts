import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Announcer, Controller} from "../../../typechain";
import {RunHelper} from "../RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tokens = await DeployerUtils.getTokenAddresses();
  const signer = (await ethers.getSigners())[0];
  const announcer = await DeployerUtils.connectContract(signer, "Announcer", core.announcer) as Announcer;

  // only for first time setting for mocks
  // await RunHelper.runAndWait(() => controller.setFundToken(tokens.get('usdc') as string));
  const opCode = '6';
  const annIdx = await announcer.timeLockIndexes(opCode);

  if (annIdx.isZero()) {
    console.log('Announce change Fund token');

    await RunHelper.runAndWait(() => announcer.announceAddressChange(opCode, tokens.get('usdc') as string));
  } else {
    console.log('change Fund token announced', annIdx)
    const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;

    const annInfo = await announcer.timeLockInfo(annIdx);
    console.log('annInfo', annInfo);

    if (annInfo.opCode !== +opCode) {
      throw Error('Wrong opcode!');
    }

    await RunHelper.runAndWait(() => controller.setFundToken(annInfo.adrValues[0]));
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
