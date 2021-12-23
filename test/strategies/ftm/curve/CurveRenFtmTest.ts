import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {startCurveStratTest} from "../../matic/curve/utils/UniversalCurveStrategyTest";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
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

chai.use(chaiAsPromised);

describe('Curve ren ftm tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }

  const underlying = FtmAddresses.renCRV_TOKEN;
  const strategyName = 'CurveRenFtmStrategy';
  const tokenName = 'BTCCRV';

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  await startCurveStratTest(
    strategyName,
    underlying,
    tokenName,
    deployInfo
  );
});
