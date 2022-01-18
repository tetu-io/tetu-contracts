import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
import {DeployInfo} from "../../DeployInfo";
import {StrategyTestUtils} from "../../StrategyTestUtils";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneBeethovenStrategyTest: {
      type: "number",
      default: 1,
    },
    hardhatChainId: {
      type: "number",
      default: 137
    },
  }).argv;

chai.use(chaiAsPromised);

describe('Universal Beethoven tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/beethoven_pools.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {

    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      return;
    }
    if (argv.onlyOneBeethovenStrategyTest !== -1 && +strat[0] !== argv.onlyOneBeethovenStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);
    /* tslint:disable:no-floating-promises */
    // startDefaultLpStrategyTest(
    //   'StrategySpookySwapLp',
    //   FtmAddresses.SPOOKY_SWAP_FACTORY,
    //   lpAddress.toLowerCase(),
    //   token0,
    //   token0Name,
    //   token1,
    //   token1Name,
    //   idx,
    //   deployInfo,
    //   100_000,
    //   60 * 60 * 24,
    //   false
    // );
  });


});
