import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Wault tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/generate/wault/wault_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx' || strat[0] === '0') {
      console.log('skip', strat[0]);
      return;
    }
    if (Settings.onlyOneWaultStrategyTest && +strat[0] !== Settings.onlyOneWaultStrategyTest) {
      return;
    }

    console.log('strat', strat[0], strat[1]);
    const strategyName = 'StrategyWault_' + strat[4] + (strat[6] ? '_' + strat[6] : '');

    if(strat[6]) {
      startDefaultLpStrategyTest(
          strategyName,
          MaticAddresses.WAULT_FACTORY,
          strat[2].toLowerCase(),
          strat[3],
          strat[5],
          [MaticAddresses.WEXpoly_TOKEN]
      );
    } else {
      startDefaultSingleTokenStrategyTest(
          strategyName,
          MaticAddresses.WAULT_FACTORY,
          strat[2].toLowerCase(),
          [MaticAddresses.WEXpoly_TOKEN]
      );
    }
  });


});
