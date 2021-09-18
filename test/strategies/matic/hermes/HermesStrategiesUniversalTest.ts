import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";


chai.use(chaiAsPromised);

describe('Universal Hermes tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/hermes_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {

    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !token1_name) {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneHermesStrategyTest && +strat[0] !== Settings.onlyOneHermesStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);

    startDefaultLpStrategyTest(
        'StrategyHermesSwapLp',
        MaticAddresses.QUICK_FACTORY,
        lp_address.toLowerCase(),
        token0,
        token0_name,
        token1,
        token1_name,
        idx,
        [MaticAddresses.IRIS_TOKEN]
    );
  });


});
