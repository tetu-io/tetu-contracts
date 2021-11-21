import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {FtmAddresses} from "../../../FtmAddresses";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneCafeStrategyTest: {
      type: "number",
      default: 1,
    }
  }).argv;

chai.use(chaiAsPromised);

describe.skip('Universal Spooky tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/spooky_pools.csv', 'utf8').split(/\r?\n/);

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
    if (argv.onlyOneCafeStrategyTest !== -1 && +strat[0] !== argv.onlyOneCafeStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);
    /* tslint:disable:no-floating-promises */
    startDefaultLpStrategyTest(
      'StrategySpookySwapLp',
      FtmAddresses.SPOOKY_SWAP_FACTORY,
      lpAddress.toLowerCase(),
      token0,
      token0Name,
      token1,
      token1Name,
      idx,
      [FtmAddresses.BOO_TOKEN]
    );
  });


});
