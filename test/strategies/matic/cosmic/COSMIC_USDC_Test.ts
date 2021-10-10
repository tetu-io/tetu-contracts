import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {config as dotEnvConfig} from "dotenv";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  }
}).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Cosmic COSMIC-USDC Test', async () => {
  if (argv.disableStrategyTests) {
    return;
  }

  const lpAddress = '0x71E600Fe09d1d8EfCb018634Ac3Ee53f8380c94A';

  await startDefaultLpStrategyTest(
      'StrategyCosmicSwapLp',
      MaticAddresses.QUICK_FACTORY,
      lpAddress.toLowerCase(),
      MaticAddresses.USDC_TOKEN,
      "USDC",
      MaticAddresses.COSMIC_TOKEN,
      "COSMIC",
      '0',
      [MaticAddresses.COSMIC_TOKEN]
  );

});
