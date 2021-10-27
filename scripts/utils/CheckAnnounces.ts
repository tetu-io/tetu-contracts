import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer} from "../../typechain";
import {appendFileSync} from "fs";

const IDS = new Map<string, string>([
  ['0', 'Governance'],
  ['1', 'Dao'],
  ['2', 'FeeRewardForwarder'],
  ['3', 'Bookkeeper'],
  ['4', 'MintHelper'],
  ['5', 'RewardToken'],
  ['6', 'FundToken'],
  ['7', 'PsVault'],
  ['8', 'Fund'],
  ['9', 'PsRatio'],
  ['10', 'FundRatio'],
  ['11', 'ControllerTokenMove'],
  ['12', 'StrategyTokenMove'],
  ['13', 'FundTokenMove'],
  ['14', 'TetuProxyUpdate'],
  ['15', 'StrategyUpgrade'],
  ['16', 'Mint'],
  ['17', 'Announcer'],
  ['18', 'ZeroPlaceholder'],
  ['19', 'VaultController'],
  ['20', 'RewardBoostDuration'],
  ['21', 'RewardRatioWithoutBoost'],
  ['22', 'VaultStop'],
]);


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
      // tslint:disable-next-line
      // @ts-ignore
      const txt = `${i},${new Date(ts * 1000)},${IDS.get(timeLockInfo.opCode, timeLockInfo.opCode)},${timeLockInfo.opHash}, ${timeLockInfo.target}, ${timeLockInfo.adrValues},${timeLockInfo.numValues}\n`;
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
