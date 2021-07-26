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

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx') {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneSushiStrategyTest && +strat[0] !== Settings.onlyOneSushiStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);

    startDefaultLpStrategyTest(
        'StrategySushiSwapLp',
        MaticAddresses.SUSHI_FACTORY,
        lp_address.toLowerCase(),
        token0,
        token0_name,
        token1,
        token1_name,
        idx,
        [MaticAddresses.SUSHI_TOKEN, MaticAddresses.WMATIC_TOKEN]
    );
  });


});
