import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
// import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";


// const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Dino tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/generate/dino_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    if (info.trim()==='') return;

    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || idx === '0') {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneDinoStrategyTest && +strat[0] !== Settings.onlyOneDinoStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);


    if (strat[6]) {
      startDefaultLpStrategyTest(
          'StrategyDinoSwapLp',
          MaticAddresses.DINO_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          token1,
          token1_name,
          idx,
          [MaticAddresses.DINO_TOKEN]
      );
    } else {
      throw new Error('Strategy DinoSwap for single token is not implemented!')
      /*startDefaultSingleTokenStrategyTest(
          'StrategyDinoSingle',
          MaticAddresses.DINO_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          idx,
          [MaticAddresses.DINO_TOKEN]
      );*/
    }
  });


});
