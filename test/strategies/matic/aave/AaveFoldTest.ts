import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {startAaveFoldStrategyTest} from "./AaveFoldStrategyTest";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  },
  onlyOneAaveFoldStrategyTest: {
    type: "number",
    default: -1,
  }
}).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Aave Fold tests', async () => {

  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const start = info.split(',');

    const idx = start[0];
    const tokenName = start[1];
    const token = start[2];
    const aTokenName = start[3];
    const aTokenAddress = start[4];
    const ltv = start[7];
    const usageAsCollateralEnabled = start[9];
    const borrowingEnabled = start[10];
    const ltvNum = Number(ltv);
    const collateralFactor = (ltvNum * 0.95).toString();
    const borrowTarget = (ltvNum * 0.8).toString();

    if (!idx || idx === 'idx' || usageAsCollateralEnabled !== "true" || borrowingEnabled !== "true") {
      console.log('skip ', tokenName);
      return;
    }

    if (argv.onlyOneAaveFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneAaveFoldStrategyTest) {
      return;
    }
    console.log('start', idx, aTokenName);

    /* tslint:disable:no-floating-promises */
    startAaveFoldStrategyTest(
        'StrategyAaveFold',
        MaticAddresses.SUSHI_FACTORY,
        token.toLowerCase(),
        tokenName,
        [MaticAddresses.WMATIC_TOKEN],
        aTokenAddress,
        borrowTarget,
        collateralFactor
    );
  });
});
