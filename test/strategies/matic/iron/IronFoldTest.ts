import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {startIronFoldStrategyTest} from "../../IronFoldStrategyTest";
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
  onlyOneIronFoldStrategyTest: {
    type: "number",
    default: -1,
  }
}).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Iron Fold tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/iron_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const rTokenName = strat[1];
    const rTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];

    if (idx === 'idx' || collateralFactor === '0') {
      console.log('skip', idx);
      return;
    }

    if (argv.onlyOneIronFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneIronFoldStrategyTest) {
      return;
    }

    console.log('strat', idx, rTokenName);

    /* tslint:disable:no-floating-promises */
    startIronFoldStrategyTest(
        'StrategyIronFold',
        MaticAddresses.DFYN_FACTORY,
        token.toLowerCase(),
        tokenName,
        [MaticAddresses.ICE_TOKEN],
        rTokenAddress,
        borrowTarget,
        collateralFactor
    );
  });
});
