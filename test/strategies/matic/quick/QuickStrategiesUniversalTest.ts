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
  const infos = readFileSync('scripts/utils/download/data/quick_pools.csv', 'utf8').split(/\r?\n/);

  const strategyName = 'StrategyQuickSwapLpV2';

  infos.forEach(info => {
    const strat = info.split(',');

    const ids = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
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
    console.log('strat', ids, lpName);

    /* tslint:disable:no-floating-promises */
    startDefaultLpStrategyTest(
        strategyName,
        MaticAddresses.QUICK_FACTORY,
        lpAddress.toLowerCase(),
        token0,
        token0Name,
        token1,
        token1Name,
        pool,
        [MaticAddresses.QUICK_TOKEN]
    );
  });


});
