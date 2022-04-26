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
import {ForwarderV2, IStrategy, SmartVault} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneTarotStrategyTest: {
      type: "number",
      default: 77,
    },
    hardhatChainId: {
      type: "number",
      default: 137
    },
  }).argv;

chai.use(chaiAsPromised);

describe('Universal Tarot tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 250) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/tarot.csv', 'utf8').split(/\r?\n/);

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

    if (+tvl < 1_00_000 || idx === 'idx') {
      console.log('skip', idx, +tvl);
      return;
    }
    if (argv.onlyOneTarotStrategyTest !== -1 && +strat[0] !== argv.onlyOneTarotStrategyTest) {
      return;
    }

    console.log('strat', idx, tokenName);
    /* tslint:disable:no-floating-promises */


    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyTarot';
    const vaultName = tokenName;
    const underlying = tokenAdr;

    // add custom liquidation path if necessary
    const forwarderConfigurator =
        async (forwarder: ForwarderV2) => {
        await forwarder.addLargestLps(
          [FtmAddresses.BEETS_TOKEN, FtmAddresses.SPIRIT_TOKEN, FtmAddresses.TAROT_TOKEN, FtmAddresses.YFI_TOKEN],
          ["0x648a7452DA25B4fB4BDB79bADf374a8f8a5ea2b5", "0x30748322B6E34545DBe0788C421886AEB5297789", "0xF050133847bb537C7476D054B8bE6e30253Fbd05", "0x4fc38a2735C7da1d71ccAbf6DeC235a7DA4Ec52C"]);
      };
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = false;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0;
    const finalBalanceTolerance = 0;
    const deposit = 1_000;
    // at least 3
    const loops = 3;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
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
            poolAdr,
            90_00
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
      strategyContractName + vaultName + idx,
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
