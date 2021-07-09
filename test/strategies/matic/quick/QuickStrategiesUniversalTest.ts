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
  const infos = readFileSync('scripts/utils/generate/quick/quick_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');
    if (+strat[9] <= 0 || !strat[3] || strat[0] === 'idx') {
      console.log('skip', strat[0]);
      return;
    }
    if (Settings.onlyOneQuickStrategyTest && +strat[0] !== Settings.onlyOneQuickStrategyTest) {
      return;
    }
    console.log('strat', strat[0], strat[1]);
    const strategyName = 'StrategyQuick_' + strat[4] + '_' + strat[6];

    startDefaultLpStrategyTest(
        strategyName,
        MaticAddresses.QUICK_FACTORY,
        strat[2].toLowerCase(),
        strat[3],
        strat[5],
        [MaticAddresses.QUICK_TOKEN]
    );
  });


});
