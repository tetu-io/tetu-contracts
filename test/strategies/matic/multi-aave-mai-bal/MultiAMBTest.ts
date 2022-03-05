import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {
  ForwarderV2,
  IStrategy,
  SmartVault,
  StrategyAaveMaiBal,
  StrategyAaveMaiBal__factory
} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {MultiAaveMaiBalTest} from "./MultiAMBDoHardWork";
import {utils} from "ethers";
import {AMBTargetPercentageTest} from "./AMBTargetPercentageTest";
import {MabRebalanceTest} from "./MabRebalanceTest";
import {SalvageFromPipelineTest} from "./SalvageFromPipelineTest";
import {PumpInOnHardWorkTest} from "./PumpInOnHardWorkTest";
import {WithdrawAndClaimTest} from "./WithdrawAndClaimTest";
import {EmergencyWithdrawFromPoolTest} from "./EmergencyWithdrawFromPoolTest";
import {CoverageCallsTest} from "./CoverageCallsTest";
import {infos} from "../../../../scripts/deploy/strategies/multi/MultiAMBInfos";
import {AMBPipeDeployer} from "../../../../scripts/deploy/strategies/multi/AMBPipeDeployer";
import {MoreMaiFromBalTest} from "./MoreMaiFromBalTest";
import {ethers} from "hardhat";
import {LiquidationPriceTest} from "./LiquidationPriceTest";
import {MaxDepositTest} from "./MaxDepositTest";


dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneAMBStrategyTest: {
      type: "number",
      default: -1,
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

chai.use(chaiAsPromised);

describe('Universal AMB tests', async () => {

  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  let airdroper: SignerWithAddress;

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    airdroper = (await ethers.getSigners())[2];
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  infos.forEach((info, i) => {

    if (argv.onlyOneAMBStrategyTest !== -1 && i !== argv.onlyOneAMBStrategyTest) {
      return;
    }
    console.log('Start test strategy', i, info.underlyingName);
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const strategyContractName = 'StrategyAaveMaiBal';
    const underlying = info.underlying;
    // add custom liquidation path if necessary
    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
        [MaticAddresses.BAL_TOKEN],
        ['0xc67136e235785727a0d3B5Cfd08325327b81d373']
      );
    };
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = false;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.021;
    const finalBalanceTolerance = 0;
    const deposit = 100_000;
    // at least 3
    const loops = 9;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
    const advanceBlocks = true;
    const specificTests: SpecificStrategyTest[] = [
      new AMBTargetPercentageTest(),
      new MabRebalanceTest(),
      new SalvageFromPipelineTest(),
      new PumpInOnHardWorkTest(),
      new WithdrawAndClaimTest(),
      new EmergencyWithdrawFromPoolTest(),
      new CoverageCallsTest(),
      new MoreMaiFromBalTest(),
      new LiquidationPriceTest(),
      new MaxDepositTest(),
    ];
    const AIRDROP_REWARDS_AMOUNT = utils.parseUnits('10000');
    const BAL_PIPE_INDEX = 3;
    // **********************************************

    const pipes: string[] = [];
    const deployer = (signer: SignerWithAddress) => {
      const core = deployInfo.core as CoreContractsWrapper;
      return StrategyTestUtils.deploy(
        signer,
        core,
        info.underlyingName,
        async vaultAddress => {
          // -----------------
          const aaveAmPipeData = await AMBPipeDeployer.deployAaveAmPipe(
            signer,
            underlying,
            info.amToken
          );
          pipes.push(aaveAmPipeData.address);
          // -----------------
          const maiCamPipeData = await AMBPipeDeployer.deployMaiCamPipe(
            signer,
            info.amToken,
            info.camToken
          );
          pipes.push(maiCamPipeData.address);
          // -----------------
          const maiStablecoinPipeData = await AMBPipeDeployer.deployMaiStablecoinPipe(
            signer,
            info.camToken,
            info.stablecoin,
            info.amToken,
            info.targetPercentage,
            info.collateralNumerator || '1'
          );
          pipes.push(maiStablecoinPipeData.address);
          // -----------------
          const balVaultPipeData = await AMBPipeDeployer.deployBalVaultPipe(
            signer
          );
          pipes.push(balVaultPipeData.address);
          // -----------------

          const strategyData = await DeployerUtils.deployTetuProxyControlled(
            signer,
            strategyContractName
          );
          await StrategyAaveMaiBal__factory.connect(strategyData[0].address, signer).initialize(
            core.controller.address,
            vaultAddress,
            info.underlying,
            pipes
          );
          return StrategyAaveMaiBal__factory.connect(strategyData[0].address, signer);
        },
        underlying,
        25
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
      return new MultiAaveMaiBalTest(
        _signer,
        _user,
        _core,
        _tools,
        _underlying,
        _vault,
        _strategy,
        _balanceTolerance,
        finalBalanceTolerance,
        info.camToken,
        airdroper,
        MaticAddresses.BAL_TOKEN,
        AIRDROP_REWARDS_AMOUNT,
        BAL_PIPE_INDEX,
      );
    };

    universalStrategyTest(
      'AMBTest_' + info.underlyingName,
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
