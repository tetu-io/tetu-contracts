import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { readFileSync } from 'fs';
import { config as dotEnvConfig } from 'dotenv';
import { DeployInfo } from '../../DeployInfo';
import { DeployerUtils } from '../../../../scripts/deploy/DeployerUtils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { StrategyTestUtils } from '../../StrategyTestUtils';
import { CoreContractsWrapper } from '../../../CoreContractsWrapper';
import { IStrategy, SmartVault } from '../../../../typechain';
import { ToolsContractsWrapper } from '../../../ToolsContractsWrapper';
import { universalStrategyTest } from '../../UniversalStrategyTest';
import { FoldingProfitabilityTest } from '../../FoldingProfitabilityTest';
import { FoldingDoHardWork } from '../../FoldingDoHardWork';

dotEnvConfig();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: 'boolean',
      default: false,
    },
    onlyOneAaveFoldStrategyTest: {
      type: 'number',
      default: -1,
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

describe('Universal Aave Fold tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync(
    'scripts/utils/download/data/aave_markets.csv',
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
    const collateralFactor = ltvNum.toFixed(0);
    const borrowTarget = (ltvNum * 0.99).toFixed(0);

    if (!idx || idx === 'idx') {
      console.log('skip ', tokenName);
      return;
    }

    if (
      argv.onlyOneAaveFoldStrategyTest !== -1 &&
      parseFloat(idx) !== argv.onlyOneAaveFoldStrategyTest
    ) {
      return;
    }
    console.log('Start test strategy', idx, aTokenName);
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyAaveFold';
    const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = null;
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.001;
    const finalBalanceTolerance = 0.0001;
    const deposit = 100_000;
    // at least 3
    const loops = 15;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
    const advanceBlocks = true;
    const specificTests = [new FoldingProfitabilityTest()];
    // **********************************************

    const deployer = async (signer: SignerWithAddress) => {
      const core = deployInfo.core as CoreContractsWrapper;
      return StrategyTestUtils.deploy(
        signer,
        core,
        tokenName,
        (vaultAddress) => {
          const strategyArgs = [
            core.controller.address,
            vaultAddress,
            underlying,
            borrowTarget,
            collateralFactor,
          ];
          return DeployerUtils.deployContract(
            signer,
            strategyContractName,
            ...strategyArgs,
          ) as Promise<IStrategy>;
        },
        underlying,
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
      _balanceTolerance: number,
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
        finalBalanceTolerance,
      );
    };

    universalStrategyTest(
      'AaveTest_' + aTokenName,
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
