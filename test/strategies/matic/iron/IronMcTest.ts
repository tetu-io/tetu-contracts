import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {startIronSwapStrategyTest} from "./IronSwapStrategyTest";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {StrategyTestUtils} from "../../StrategyTestUtils";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneIronStrategyTest: {
      type: "number",
      default: 0,
    },
    deployCoreContracts: {
      type: "boolean",
      default: false,
    },
    hardhatChainId: {
      type: "number",
      default: 137
    },
  }).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

const ironSwapIds = new Set<string>([
  "0",
  "3"
]);

describe.skip('Universal Iron tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/iron_pools.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const tokens = strat[4]?.split(' | ');
    const tokenNames = strat[5]?.split(' | ');
    const alloc = strat[6];

    if (+alloc <= 0 || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    if (argv.onlyOneIronStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneIronStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);

    if (ironSwapIds.has(idx)) {
      startIronSwapStrategyTest(
        'StrategyIronSwap',
        MaticAddresses.DFYN_FACTORY,
        lpAddress.toLowerCase(),
        tokens,
        tokenNames.join('_'),
        idx,
        deployInfo
      );
    } else {
      startDefaultLpStrategyTest(
        'StrategyIronUniPair',
        MaticAddresses.DFYN_FACTORY,
        lpAddress.toLowerCase(),
        tokens[0],
        tokenNames[0],
        tokens[1],
        tokenNames[1],
        idx,
        deployInfo
      );
    }


  });

});
