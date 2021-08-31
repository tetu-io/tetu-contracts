import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
import {startIronSwapStrategyTest} from "../../IronSwapStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

const ironSwapIds = new Set<string>([
  "0",
  "3"
]);

describe('Universal Iron tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/iron_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const tokens = strat[4].split(' | ');
    const tokenNames = strat[5].split(' | ');
    const alloc = strat[6];

    if (+alloc <= 0 || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    if (Settings.onlyOneIronStrategyTest !== null && parseFloat(idx) !== Settings.onlyOneIronStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);

    if (ironSwapIds.has(idx)) {
      startIronSwapStrategyTest(
          'StrategyIronSwap',
          MaticAddresses.DFYN_FACTORY,
          lp_address.toLowerCase(),
          tokens,
          tokenNames.join('_'),
          idx,
          [MaticAddresses.ICE_TOKEN]
      );
    } else {
      startDefaultLpStrategyTest(
          'StrategyIronUniPair',
          MaticAddresses.DFYN_FACTORY,
          lp_address.toLowerCase(),
          tokens[0],
          tokenNames[0],
          tokens[1],
          tokenNames[1],
          idx,
          [MaticAddresses.ICE_TOKEN]
      );
    }


  });

});
