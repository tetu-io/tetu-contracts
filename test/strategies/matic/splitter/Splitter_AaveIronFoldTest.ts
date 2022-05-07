import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployInfo} from "../../DeployInfo";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ForwarderV2, IStrategy, IStrategy__factory, SmartVault} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {Misc} from "../../../../scripts/utils/tools/Misc";
import {SplitterDoHardWork} from "../../SplitterDoHardWork";
import {SplitterSpecificTests} from "./SplitterSpecificTests";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
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
    onlyOneSplitterAaveIronFoldStrategyTest: {
      type: "number",
      default: 2,
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

describe('Splitter with Aave/Iron Fold tests', async () => {

  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const aaveInfos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);
  const ironInfos = readFileSync('scripts/utils/download/data/iron_markets.csv', 'utf8').split(/\r?\n/);

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  aaveInfos.forEach(aaveInfo => {
    const aaveStart = aaveInfo.split(',');
    const aaveIdx = aaveStart[0];
    const tokenName = aaveStart[1];
    const token = aaveStart[2];

    if (!aaveIdx || aaveIdx === 'idx') {
      console.log('skip ', tokenName);
      return;
    }
    console.log('Start test strategy', aaveStart);

    let ironStrat: string[];
    let found = false;
    for (const ironI of ironInfos) {
      ironStrat = ironI.split(',');
      const ironToken = ironStrat[3];
      if (!ironToken) {
        continue;
      }
      console.log('ironToken', ironI)
      if (ironToken.toLowerCase() === token.toLowerCase()) {
        found = true;
        break;
      }
    }
    console.log('found', found)
    if (!found) {
      console.log('NOT FOUND IRON!', aaveInfo)
      return;
    }

    if (argv.onlyOneSplitterAaveIronFoldStrategyTest !== -1 && parseFloat(aaveIdx) !== argv.onlyOneSplitterAaveIronFoldStrategyTest) {
      return;
    }
    // **********************************************
    // ************** CONFIG*************************
    // **********************************************
    const underlying = token;
    // add custom liquidation path if necessary
    const forwarderConfigurator = async (forwarder: ForwarderV2) => {
      await forwarder.addLargestLps(
        [MaticAddresses.ICE_TOKEN],
        ["0x34832D9AC4127a232C1919d840f7aaE0fcb7315B"]
      );
    };
    // only for strategies where we expect PPFS fluctuations
    const ppfsDecreaseAllowed = true;
    // only for strategies where we expect PPFS fluctuations
    const balanceTolerance = 0.001;
    const finalBalanceTolerance = 0.0001;
    const deposit = 100_000;
    // at least 3
    const loops = 5;
    // number of blocks or timestamp value
    const loopValue = 3000;
    // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
    const advanceBlocks = true;
    const specificTests: SpecificStrategyTest[] = [new SplitterSpecificTests()];
    // **********************************************

    const deployer = (signer: SignerWithAddress) => {
      const core = deployInfo.core as CoreContractsWrapper;
      return StrategyTestUtils.deploy(
        signer,
        core,
        tokenName,
        async vaultAddress => {
          const splitter = await DeployerUtils.deployStrategySplitter(signer);
          await splitter.initialize(
            core.controller.address,
            underlying,
            vaultAddress,
          );

          const splitter2 = await DeployerUtils.deployStrategySplitter(signer);
          await splitter2.initialize(
            core.controller.address,
            underlying,
            splitter.address,
          );

          // *** INIT FIRST SPLITTER ***
          const aave = await deployAave(signer, aaveStart, core.controller.address, splitter.address)
          const iron = await deployIron(signer, ironStrat, core.controller.address, splitter.address)
          const strats: string[] = [aave, splitter2.address, iron];

          await core.controller.addStrategiesToSplitter(splitter.address, strats);

          await splitter.setStrategyRatios(
            strats,
            [30, 50, 20]
          );

          // *** INIT SECOND SPLITTER ***
          const aave2 = await deployAave(signer, aaveStart, core.controller.address, splitter2.address)
          const iron2 = await deployIron(signer, ironStrat, core.controller.address, splitter2.address)
          const strats2: string[] = [aave2, iron2];

          await core.controller.addStrategiesToSplitter(splitter2.address, strats2);

          await splitter2.setStrategyRatios(
            strats2,
            [30, 70]
          );

          return IStrategy__factory.connect(splitter.address, signer);
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
      return new SplitterDoHardWork(
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
      'SplitterAaveIron_' + tokenName,
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


async function deployAave(
  signer: SignerWithAddress,
  info: string[],
  controller: string,
  vaultAddress: string
) {
  const token = info[2];
  const ltvNum = Number(info[7]);
  const collateralFactor = (ltvNum).toFixed(0);
  const borrowTarget = (ltvNum * Misc.AAVE_BOR_RATIO).toFixed(0);

  const strategyArgs = [
    controller,
    vaultAddress,
    token,
    borrowTarget,
    collateralFactor
  ];
  const strat = await DeployerUtils.deployContract(
    signer,
    'StrategyAaveFold',
    ...strategyArgs
  ) as IStrategy;
  return strat.address;
}

async function deployIron(
  signer: SignerWithAddress,
  info: string[],
  controller: string,
  vaultAddress: string
) {
  const rTokenAddress = info[2];
  const underlying = info[3];
  const collateralFactor = info[5];
  const borrowTarget = info[6];

  const strategyArgs = [
    controller,
    vaultAddress,
    underlying,
    rTokenAddress,
    borrowTarget,
    collateralFactor
  ];
  const strategy = await DeployerUtils.deployContract(
    signer,
    'StrategyIronFold',
    ...strategyArgs
  ) as IStrategy;
  return strategy.address;
}
