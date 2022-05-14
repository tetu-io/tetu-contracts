import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {config as dotEnvConfig} from "dotenv";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";
import {DeployInfo} from "../../DeployInfo";

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

const {expect} = chai;
chai.use(chaiAsPromised);

describe.skip('Dino pool tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const underlying = MaticAddresses.DINO_TOKEN;
  const strategyName = 'StrategyDinoPool';
  const tokenName = 'DINO';

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  await startDefaultSingleTokenStrategyTest(
    strategyName,
    underlying,
    tokenName,
    deployInfo
  );
});
