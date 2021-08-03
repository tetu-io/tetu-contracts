import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer, Bookkeeper, ContractReader} from "../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const announcer = await DeployerUtils.connectContract(
      signer, "Announcer", core.announcer) as Announcer;

  const timeLockInfos = await announcer.timeLockInfos();

  for (let timeLockInfo of timeLockInfos) {
    console.info('timeLockInfo', timeLockInfo.opCode);

    const ts = (await announcer.timeLockSchedule(timeLockInfo.opHash)).toNumber();
    console.log('ts', ts, new Date(ts * 1000), Date.now() / 1000);
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
