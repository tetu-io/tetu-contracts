import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IStrategy, SmartVault} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneQuickDualStrategyTest: {
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

describe('Universal Quick Dual tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/quick_pools_dual.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  const strategyName = 'StrategyQuickSwapLpDualAC';

  infos.forEach(info => {
    const strat = info.split(',');

    const ids = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const pool = strat[7];
    const rewardAmount = strat[8];
    const r0 = strat[14];
    const r1 = strat[15];

    if (+rewardAmount <= 0 || !token0 || ids === 'idx') {
      console.log('skip', ids, rewardAmount);
      return;
    }
    if (argv.onlyOneQuickDualStrategyTest !== -1 && +ids !== argv.onlyOneQuickDualStrategyTest) {
      console.log('only one strat', ids, argv.onlyOneQuickDualStrategyTest);
      return;
    }
    console.log('strat', ids, lpName);

    const rewards = [MaticAddresses.QUICK_TOKEN, r1];
    const underlying = lpAddress.toLowerCase();
    const platformPoolIdentifier = pool;

    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = strategyName;
    const vaultName = token0Name + "_" + token1Name;
    // const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = null;
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = false;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0;
    const finalBalanceTolerance = 0;
    const deposit = 100_000;
    // at least 3
    const loops = 3;
    const loopValue = 300;
    const advanceBlocks = true;
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
            vaultAddress,
            underlying,
            token0,
            token1,
            platformPoolIdentifier,
            rewards
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

    universalStrategyTest(
      strategyName + vaultName,
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
