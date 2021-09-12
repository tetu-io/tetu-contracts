import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
import {startIronFoldStrategyTest} from "../../IronFoldStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Iron Fold tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/iron_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const rToken_name = strat[1];
    const rToken_address = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];

    if (idx === 'idx' || collateralFactor === '0') {
      console.log('skip', idx);
      return;
    }

    if (Settings.onlyOneIronFoldStrategyTest !== null && parseFloat(idx) !== Settings.onlyOneIronFoldStrategyTest) {
      return;
    }

    console.log('strat', idx, rToken_name);

    startIronFoldStrategyTest(
        'StrategyIronFold',
        MaticAddresses.DFYN_FACTORY,
        token.toLowerCase(),
        tokenName,
        [MaticAddresses.ICE_TOKEN],
        rToken_address,
        borrowTarget,
        collateralFactor
    );
  });
});
