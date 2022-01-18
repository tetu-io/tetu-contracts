import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {ForwarderV2, IStrategy, SmartVault} from "../../../../typechain";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
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
      onlyOneTombStrategyTest: {
        type: "number",
        default: 1,
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

describe('Universal Tomb tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/tomb_pools.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const strat = info.split(',');
    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];

    if (idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      return;
    }
    if (argv.onlyOneTombStrategyTest !== -1 && +strat[0] !== argv.onlyOneTombStrategyTest) {
      return;
    }

    console.log('strat', idx, lpName);
    /* tslint:disable:no-floating-promises */
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyTombLp';
    const vaultName = token0Name + "_" + token1Name;
    const underlying = lpAddress;
    const deposit = 100_000;
    const loopValue = 300;
    const advanceBlocks = true;

    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
          [FtmAddresses.TSHARE_TOKEN],
          ['0x4733bc45ef91cf7ccecaeedb794727075fb209f2']
      );
    };
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = false;
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
              token0,
              token1,
              idx
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
