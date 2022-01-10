import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {IStrategy, SmartVault} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {ScreamDoHardWork} from "./ScreamDoHardWork";
import {DeployInfo} from "../../DeployInfo";
import {FoldingProfitabilityTest} from "../../FoldingProfitabilityTest";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneScreamFoldStrategyTest: {
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

describe('Universal Scream Fold tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/scream_markets.csv', 'utf8').split(/\r?\n/);
  const deployInfo: DeployInfo = new DeployInfo();

  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const scTokenName = strat[1];
    const scTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];
    const tvl = strat[7];
    const tvlNum = Number(tvl);
    const supplyCap = strat[8];

    // skip FRAX token (no price)
    // skip YFI token (no rewards)
    // skip BIFI token (no rewards)
    if (!idx || idx === 'idx' || collateralFactor === '-1' || supplyCap !== '0' || tvlNum < 50000 || ['YFI', 'BIFI'].some(i => i === tokenName)) {
      console.log('skip', idx);
      return;
    }

    if (argv.onlyOneScreamFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneScreamFoldStrategyTest) {
      return;
    }

    console.log('Start test strategy', idx, scTokenName);
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyScreamFold';
    const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = null;
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.00001;
    const finalBalanceTolerance = 0.001;
    let deposit = 100_000;
    // not enough money on holder
    if (tokenName === 'CRV') {
      deposit = 10_000;
    }
    // at least 3
    const loops = 9;
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
            scTokenAddress,
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
      return new ScreamDoHardWork(
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
      'Scream Test_' + tokenName,
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
