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

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
    .env('TETU')
    .options({
      disableStrategyTests: {
        type: "boolean",
        default: false,
      },
      onlyOneImpermaxStrategyTest: {
        type: "number",
        default: 47,
      },
      deployCoreContracts: {
        type: "boolean",
        default: true,
      },
      hardhatChainId: {
        type: "number",
        default: 137
      },
    }).argv;

chai.use(chaiAsPromised);

describe('Universal Impermax tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/impermax.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {

    const strat = info.split(',');

    const idx = strat[0];
    const lp = strat[1];
    const tokenName = strat[2];
    const tokenAdr = strat[3];
    const poolAdr = strat[4];
    const tvl = strat[5];
    const borrow = strat[6];
    const utilization = strat[7];

    if (+tvl < 1_000 || idx === 'idx') {
      console.log('skip', idx, +tvl);
      return;
    }
    if (argv.onlyOneImpermaxStrategyTest !== -1 && +strat[0] !== argv.onlyOneImpermaxStrategyTest) {
      return;
    }

    console.log('strat', idx, tokenName);
    /* tslint:disable:no-floating-promises */


    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyImpermaxMatic';
    const vaultName = tokenName;
    const underlying = tokenAdr;
    const deposit = 100_000;
    const loopValue = 300;
    const advanceBlocks = true;

    // add custom liquidation path if necessary
    const forwarderConfigurator = null;
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
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
              vaultAddress,
              underlying,
              poolAdr,
              100_00
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
        strategyContractName + '_' + vaultName,
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
