import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
import {DeployInfo} from "../../DeployInfo";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {ForwarderV2, IStrategy, SmartVault} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {ethers} from "ethers";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneBeethovenStrategyTest: {
      type: "number",
      default: 1,
    },
    hardhatChainId: {
      type: "number",
      default: 137
    },
  }).argv;

chai.use(chaiAsPromised);

describe('Universal Beethoven tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/beethoven_pools.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {

    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const depositToken = strat[3];
    const beethovenPoolId = strat[4];
    const rewardToDepositPoolId = strat[5];

    // 0 - no rewards
    // 9 - need stake to get rewards
    if (idx === 'idx' || idx ==='0' || idx ==='9') {
      console.log('skip', idx);
      return;
    }
    if (argv.onlyOneBeethovenStrategyTest !== -1 && +strat[0] !== argv.onlyOneBeethovenStrategyTest) {
      return;
    }

    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = "StrategyBeethoven";
    const vaultName = "Beets" + "_" + lpName;
    const underlying = lpAddress;
    // add custom liquidation path if necessary
    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
        [FtmAddresses.BEETS_TOKEN],
        ["0x648a7452DA25B4fB4BDB79bADf374a8f8a5ea2b5"]
      );
    };

    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = false;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0;
    const finalBalanceTolerance = 0;
    // at least 3
    const loops = 3;
    const specificTests: SpecificStrategyTest[] = [];
    // **********************************************

    const deployer = (signer: SignerWithAddress) => {
      const core = deployInfo.core as CoreContractsWrapper;
      return StrategyTestUtils.deploy(
        signer,
        core,
        vaultName,
        vaultAddress => {
          const strategyArgs = [
            core.controller.address,
            underlying,
            vaultAddress,
            idx,
            depositToken,
            beethovenPoolId,
            rewardToDepositPoolId
          ];
          return DeployerUtils.deployContract(
            signer,
            strategyContractName,
            ...strategyArgs
          ) as Promise<IStrategy>;
        },
        underlying
      );
    };
    const hwInitiator = (
      _signer: SignerWithAddress,
      _user: SignerWithAddress,
      _core: CoreContractsWrapper,
      _tools: ToolsContractsWrapper,
      _underlying: string,
      _vault: SmartVault,
      _strategy: IStrategy,
      _balanceTolerance: number
    ) => {
      return new DoHardWorkLoopBase(
        _signer,
        _user,
        _core,
        _tools,
        _underlying,
        _vault,
        _strategy,
        _balanceTolerance,
        finalBalanceTolerance,
      );
    };
    console.log('strat', idx, lpName);
    /* tslint:disable:no-floating-promises */
    universalStrategyTest(
      strategyContractName + vaultName,
      deployInfo,
      deployer,
      hwInitiator,
      forwarderConfigurator,
      ppfsDecreaseAllowed,
      balanceTolerance,
      200_000,
      loops,
      60 * 60 * 24,
      false,
      specificTests,
    );
  });


});
