import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Sushi tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/generate/sushi/sushi_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx') {
      console.log('skip', strat[0]);
      return;
    }
    if (Settings.onlyOneSushiStrategyTest && +strat[0] !== Settings.onlyOneSushiStrategyTest) {
      return;
    }

    console.log('strat', strat[0], strat[1]);
    const strategyName = 'StrategySushi_' + strat[4] + '_' + strat[6];

    startDefaultLpStrategyTest(
        strategyName,
        MaticAddresses.SUSHI_FACTORY,
        strat[2].toLowerCase(),
        strat[3],
        strat[5],
        [MaticAddresses.SUSHI_TOKEN, MaticAddresses.WMATIC_TOKEN]
    );
  });


});
