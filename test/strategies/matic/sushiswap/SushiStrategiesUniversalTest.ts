import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MaticAddresses } from '../../../../scripts/addresses/MaticAddresses';
import { startDefaultLpStrategyTest } from '../../DefaultLpStrategyTest';
import { readFileSync } from 'fs';
import { config as dotEnvConfig } from 'dotenv';
import { DeployInfo } from '../../DeployInfo';
import { StrategyTestUtils } from '../../StrategyTestUtils';

dotEnvConfig();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: 'boolean',
      default: false,
    },
    onlyOneSushiStrategyTest: {
      type: 'number',
      default: 1,
    },
    deployCoreContracts: {
      type: 'boolean',
      default: false,
    },
    hardhatChainId: {
      type: 'number',
      default: 137,
    },
  }).argv;

const { expect } = chai;
chai.use(chaiAsPromised);

describe('Universal Sushi tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync(
    'scripts/utils/download/data/sushi_pools.csv',
    'utf8',
  ).split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(
      deployInfo,
      argv.deployCoreContracts,
    );
  });

  infos.forEach((info) => {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx') {
      console.log('skip', idx);
      return;
    }
    if (
      argv.onlyOneSushiStrategyTest !== -1 &&
      +strat[0] !== argv.onlyOneSushiStrategyTest
    ) {
      return;
    }

    console.log('strat', idx, lpName);
    /* eslint-disable @typescript-eslint/no-floating-promises */
    startDefaultLpStrategyTest(
      'StrategySushiSwapLpWithAc',
      MaticAddresses.SUSHI_FACTORY,
      lpAddress.toLowerCase(),
      token0,
      token0Name,
      token1,
      token1Name,
      idx,
      deployInfo,
    );
  });
});
