import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer} from "../../typechain";
import {appendFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const announcer = await DeployerUtils.connectContract(
    signer, "Announcer", core.announcer) as Announcer;

  const timeLockInfosLength = (await announcer.timeLockInfosLength()).toNumber();
  appendFileSync(`./tmp/announces.txt`, '\n-----------\n', 'utf8');
  for (let i = timeLockInfosLength - 1; i >= 0; i--) {
    console.log('i', i);
    const timeLockInfo = await announcer.timeLockInfo(i);
    if (timeLockInfo.opCode === 18 || timeLockInfo.opCode === 22) {
      continue;
    }


    const ts = (await announcer.timeLockSchedule(timeLockInfo.opHash)).toNumber();
    if (ts !== 0) {
      console.log('ts', ts, new Date(ts * 1000), Date.now() / 1000);
      console.info('timeLockInfo', timeLockInfo.opCode, timeLockInfo);
      const txt = `${i},${new Date(ts * 1000)},${timeLockInfo.opCode},${timeLockInfo.opHash}, ${timeLockInfo.target}, ${timeLockInfo.adrValues},${timeLockInfo.numValues}\n`;
      appendFileSync(`./tmp/announces.txt`, txt, 'utf8');
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
