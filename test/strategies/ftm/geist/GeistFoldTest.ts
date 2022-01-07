import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ForwarderV2, IStrategy, SmartVault} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {FoldingDoHardWork} from "../../FoldingDoHardWork";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
import {FoldingProfitabilityTest} from "../../FoldingProfitabilityTest";
import {Misc} from "../../../../scripts/utils/tools/Misc";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneGeistFoldStrategyTest: {
      type: "number",
      default: 1,
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

describe('Universal Geist Fold tests', async () => {

  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/geist_markets.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const start = info.split(',');

    const idx = start[0];
    const tokenName = start[1];
    const token = start[2];
    const aTokenName = start[3];
    const aTokenAddress = start[4];
    const ltv = start[7];
    const usageAsCollateralEnabled = start[9];
    const borrowingEnabled = start[10];
    const ltvNum = Number(ltv);
    const collateralFactor = (ltvNum).toFixed(0);
    const borrowTarget = (ltvNum * Misc.GEIST_BOR_RATIO).toFixed(0);

    if (!idx || idx === 'idx') {
      console.log('skip ', tokenName);
      return;
    }

    if (argv.onlyOneGeistFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneGeistFoldStrategyTest) {
      return;
    }
    console.log('Start test strategy', idx, aTokenName);
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyGeistFold';
    const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
        [FtmAddresses.GEIST_TOKEN],
        ['0x668AE94D0870230AC007a01B471D02b2c94DDcB9']
      );
    };
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.001;
    const finalBalanceTolerance = 0.001;
    const deposit = 100_000;
    // at least 3
    const loops = 15;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
    const advanceBlocks = true;
    const specificTests = [new FoldingProfitabilityTest()];
    // **********************************************

    const deployer = (signer: SignerWithAddress) => {
      const core = deployInfo.core as CoreContractsWrapper;
      return StrategyTestUtils.deploy(
        signer,
        core,
        tokenName,
        vaultAddress => {
          const strategyArgs = [
            core.controller.address,
            vaultAddress,
            underlying,
            borrowTarget,
            collateralFactor
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
      const hw = new FoldingDoHardWork(
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
      hw.toClaimCheckTolerance = 0.5;
      return hw;
    };

    universalStrategyTest(
      'GeistTest_' + aTokenName,
      deployInfo,
      deployer,
      hwInitiator,
      forwarderConfigurator,
      ppfsDecreaseAllowed,
      balanceTolerance,
      deposit,
      loops,
      loopValue,
      advanceBlocks,
      specificTests,
    );
  });
});
