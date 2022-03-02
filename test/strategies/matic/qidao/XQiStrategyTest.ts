import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {config as dotEnvConfig} from "dotenv";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {DeployInfo} from "../../DeployInfo";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {
  IStrategy,
  SmartVault,
  SmartVault__factory,
  StrategyQiStaking,
  StrategyTetuQiSelfFarm
} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {XQiDoHardWork} from "./XQiDoHardWork";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {VaultUtils} from "../../../VaultUtils";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
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

describe('Qi staking tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  let tetuQiVault: string;

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);

    // **
    const _signer = await DeployerUtils.impersonate()
    const core = deployInfo.core as CoreContractsWrapper;
    const data = await StrategyTestUtils.deploy(
      _signer,
      core,
      'tetuQi',
      async vaultAddress => {
        const strategy = await DeployerUtils.deployStrategyProxy(
          _signer,
          'StrategyQiStaking',
        ) as StrategyQiStaking;
        await strategy.initialize(core.controller.address, vaultAddress);
        return strategy;
      },
      MaticAddresses.QI_TOKEN
    );
    await SmartVault__factory.connect(data[0].address, _signer).changeDoHardWorkOnInvest(true);
    await SmartVault__factory.connect(data[0].address, _signer).changeAlwaysInvest(true);
    await core.vaultController.addRewardTokens([data[0].address], data[0].address);

    await VaultUtils.addRewardsXTetu(_signer, data[0], core, 100_000)
    await core.controller.setRewardDistribution([data[1].address], true);
    tetuQiVault = data[0].address;
    // **
  });

  // **********************************************
  // ************** CONFIG*************************
  // **********************************************
  const strategyContractName = 'StrategyTetuQiSelfFarm';
  const vaultName = 'xtetuQi';

  // only for strategies where we expect PPFS fluctuations
  const ppfsDecreaseAllowed = false;
  // only for strategies where we expect PPFS fluctuations
  const balanceTolerance = 0;
  const finalBalanceTolerance = 0;
  const deposit = 100_000;
  // at least 3
  const loops = 3;
  // number of blocks or timestamp value
  const loopValue = 300;
  // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
  const advanceBlocks = true;
  const specificTests: SpecificStrategyTest[] = [];
  // **********************************************

  const deployer = async (signer: SignerWithAddress) => {
    const core = deployInfo.core as CoreContractsWrapper;
    return StrategyTestUtils.deploy(
      signer,
      core,
      vaultName,
      async vaultAddress => {
        const strategy = await DeployerUtils.deployStrategyProxy(
          signer,
          strategyContractName,
        ) as StrategyTetuQiSelfFarm;
        await strategy.initialize(core.controller.address, vaultAddress, tetuQiVault);
        return strategy;
      },
      tetuQiVault
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
    return new XQiDoHardWork(
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

  await universalStrategyTest(
    strategyContractName + vaultName,
    deployInfo,
    deployer,
    hwInitiator,
    null,
    ppfsDecreaseAllowed,
    balanceTolerance,
    deposit,
    loops,
    loopValue,
    advanceBlocks,
    specificTests,
  );
});
