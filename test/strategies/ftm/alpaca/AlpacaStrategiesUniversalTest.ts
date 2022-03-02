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
      onlyOneAlpacaStrategyTest: {
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

describe('Universal Alpaca tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/alpaca_pools.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach(info => {
    const strat = info.split(',');
    const idx = strat[0];
    const alpacaVaultName = strat[1];
    const alpacaVaultAddress = strat[2];
    const underlyingName = strat[3];
    const underlyingAddress = strat[4];

    if (idx === 'idx') {
      console.log('skip', idx);
      return;
    }
    if (argv.onlyOneAlpacaStrategyTest !== -1 && +strat[0] !== argv.onlyOneAlpacaStrategyTest) {
      return;
    }

    console.log('strat', idx, alpacaVaultName);
    /* tslint:disable:no-floating-promises */
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyAlpacaVault';
    const vaultName = "Alpaca"+ " " +underlyingName;
    const underlying = underlyingAddress;
    const deposit = 100_000;
    const loopValue = 60 * 60 * 24;
    const advanceBlocks = true;

    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
          [FtmAddresses.ALPACA_TOKEN],
          ["0xF66D2bf736c05723b62E833A5DD747E24855ff99"]
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
              idx,
              alpacaVaultAddress
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
