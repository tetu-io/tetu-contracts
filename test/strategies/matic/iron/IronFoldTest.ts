import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {IStrategy, SmartVault, StrategyIronFold} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DeployInfo} from "../../DeployInfo";
import {FoldingDoHardWork} from "../../FoldingDoHardWork";
import {FoldingProfitabilityTest} from "../../FoldingProfitabilityTest";

dotEnvConfig();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneIronFoldStrategyTest: {
      type: "number",
      default: 5,
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

describe('Universal Iron Fold tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/iron_markets.csv', 'utf8').split(/\r?\n/);
  const deployInfo: DeployInfo = new DeployInfo();

  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const rTokenName = strat[1];
    const rTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];

    if (!idx || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    if (argv.onlyOneIronFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneIronFoldStrategyTest) {
      return;
    }

    console.log('Start test strategy', idx, rTokenName);
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyIronFold';
    const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = null;
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.00001;
    const finalBalanceTolerance = 0.00001;
    let deposit = 100_000;
    if (rTokenName === 'rICE') {
      deposit = 10_000;
    }
    // at least 3
    const loops = 15;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
    const advanceBlocks = true;
    let specificTests = [new FoldingProfitabilityTest()];
    if(borrowTarget==='0'){
      specificTests = []
    }
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
            rTokenAddress,
            borrowTarget,
            collateralFactor
          ];
          return DeployerUtils.deployContract(
            signer,
            strategyContractName,
            ...strategyArgs
          ) as Promise<IStrategy>
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
      return new FoldingDoHardWork(
        _signer,
        _user,
        _core,
        _tools,
        _underlying,
        _vault,
        _strategy,
        _balanceTolerance,
        finalBalanceTolerance
      );
    };

    universalStrategyTest(
      'IronTest_' + rTokenName,
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
      specificTests
    );
  });
});
