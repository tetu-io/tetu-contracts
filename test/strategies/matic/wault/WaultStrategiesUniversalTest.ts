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
  const infos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

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

    if (+alloc <= 0 || idx === 'idx' || idx === '0' || !lp_address) {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneWaultStrategyTest && +strat[0] !== Settings.onlyOneWaultStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);


    if (strat[6]) {
      startDefaultLpStrategyTest(
          'StrategyWaultLp',
          MaticAddresses.WAULT_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          token1,
          token1_name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    } else {
      startDefaultSingleTokenStrategyTest(
          'StrategyWaultSingle',
          MaticAddresses.WAULT_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    }
  });


});
