import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Quick tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/generate/quick_pools.csv', 'utf8').split(/\r?\n/);

  const strategyName = 'StrategyQuickSwapLp';

  infos.forEach(info => {
    const strat = info.split(',');

    const ids = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const pool = strat[7];
    const rewardAmount = strat[8];
    const duration = strat[9];

    if (+duration <= 0 || !token0 || ids === 'idx') {
      console.log('skip', ids, duration);
      return;
    }
    if (Settings.onlyOneQuickStrategyTest && +ids !== Settings.onlyOneQuickStrategyTest) {
      console.log('only one strat', ids, Settings.onlyOneQuickStrategyTest);
      return;
    }
    console.log('strat', ids, lp_name);


    startDefaultLpStrategyTest(
        strategyName,
        MaticAddresses.QUICK_FACTORY,
        lp_address.toLowerCase(),
        token0,
        token0_name,
        token1,
        token1_name,
        pool,
        [MaticAddresses.QUICK_TOKEN]
    );
  });


});
