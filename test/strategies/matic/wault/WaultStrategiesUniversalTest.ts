import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";
import {config as dotEnvConfig} from "dotenv";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  },
  onlyOneWaultStrategyTest: {
    type: "number",
    default: 1,
  }
}).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe.skip('Universal Wault tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

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

    if (+alloc <= 0 || idx === 'idx' || idx === '0' || !lpAddress) {
      console.log('skip', idx);
      return;
    }
    if (argv.onlyOneWaultStrategyTest !== -1 && +strat[0] !== argv.onlyOneWaultStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);


    if (strat[6]) {
      /* tslint:disable:no-floating-promises */
      startDefaultLpStrategyTest(
          'StrategyWaultLp',
          MaticAddresses.WAULT_FACTORY,
          lpAddress.toLowerCase(),
          token0,
          token0Name,
          token1,
          token1Name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    } else {
      /* tslint:disable:no-floating-promises */
      startDefaultSingleTokenStrategyTest(
          'StrategyWaultSingle',
          MaticAddresses.WAULT_FACTORY,
          lpAddress.toLowerCase(),
          token0,
          token0Name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    }
  });


});
