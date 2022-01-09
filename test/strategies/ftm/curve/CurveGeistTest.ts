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


describe('Curve geist tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const underlying = FtmAddresses.g3CRV_TOKEN;
  const strategyName = 'CurveGeistStrategy';
  const tokenName = 'g3CRV';

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
