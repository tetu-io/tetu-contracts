import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {appendFileSync, mkdir, writeFileSync} from "fs";
import {SmartVault__factory} from "../../../typechain";
import {utils} from "ethers";
import {TimeUtils} from "../../../test/TimeUtils";

const VAULT = '0x4dd1514c8ef880095AC16332Ff046d0dc2c962AA';
const BLOCK_START = 22599708;
const BLOCK_END = 27659658;
const BLOCK_STEP = 10_000;

async function main() {
  // const signer = await DeployerUtils.impersonate();
  const signer = (await ethers.getSigners())[0];
  // const user = await DeployerUtils.impersonate('0x8f3a89a0b67478b8c78c0b79a50f0454d05c1f1e');
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  const vault = SmartVault__factory.connect(VAULT, signer);
  const name = await vault.name();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  mkdir('./tmp/stats', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const fileName = `./tmp/stats/${chainId}_${name}_ppfs.txt`;
  writeFileSync(fileName, '', 'utf8');

  const dec = await vault.decimals();
  for (let i = BLOCK_START; i < BLOCK_END; i = i + BLOCK_STEP) {
    const ppfs = +utils.formatUnits((await vault.getPricePerFullShare({blockTag: i})), dec) - 1;
    const blocTs = await TimeUtils.getBlockTime(i);
    const d = (new Date(blocTs * 1000)).toISOString()
      .replace('T', ' ')
      .replace('Z', '');
    console.log(i, d, ppfs);
    appendFileSync(fileName, `${i},${d},${ppfs}\n`, 'utf8');
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
