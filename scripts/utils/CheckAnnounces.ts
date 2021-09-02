import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const announcer = await DeployerUtils.connectContract(
      signer, "Announcer", core.announcer) as Announcer;

  const timeLockInfosLength = (await announcer.timeLockInfosLength()).toNumber();

  for (let i = timeLockInfosLength - 1; i >= 0; i--) {
    const timeLockInfo = await announcer.timeLockInfo(i);
    if (timeLockInfo.opCode === 18 || timeLockInfo.opCode === 22) {
      continue;
    }


    const ts = (await announcer.timeLockSchedule(timeLockInfo.opHash)).toNumber();
    if (ts !== 0) {
      console.log('ts', ts, new Date(ts * 1000), Date.now() / 1000);
      console.info('timeLockInfo', timeLockInfo.opCode, timeLockInfo);
    }
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
