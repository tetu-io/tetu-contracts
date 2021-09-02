import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('Cosmic COSMIC-USDC Test', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }

  const lp_address = '0x71E600Fe09d1d8EfCb018634Ac3Ee53f8380c94A';

  await startDefaultLpStrategyTest(
      'StrategyCosmicSwapLp',
      MaticAddresses.QUICK_FACTORY,
      lp_address.toLowerCase(),
      MaticAddresses.USDC_TOKEN,
      "USDC",
      MaticAddresses.COSMIC_TOKEN,
      "COSMIC",
      '0',
      [MaticAddresses.COSMIC_TOKEN]
  );

});
