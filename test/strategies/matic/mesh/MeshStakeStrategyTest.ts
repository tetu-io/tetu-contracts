import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {config as dotEnvConfig} from "dotenv";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {DeployInfo} from "../../DeployInfo";
import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IStrategy, SmartVault, SmartVault__factory, StrategyMeshStaking} from "../../../../typechain";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../UniversalStrategyTest";
import {MeshStakingDoHardWork} from "./MeshStakingDoHardWork";
import {VeMeshSpecificTests} from "./veMeshSpecificTests";

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

describe('Mesh staking tests', async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const strategyName = 'StrategyMeshStaking';
  const underlying = MaticAddresses.MESH_TOKEN;

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(deployInfo, argv.deployCoreContracts);
  });

  // **********************************************
  // ************** CONFIG*************************
  // **********************************************
  const strategyContractName = strategyName;
  const vaultName = 'tetuMesh';
  // needed for custom tests.
  const tetuMeshAddress = '0xDcB8F34a3ceb48782c9f3F98dF6C12119c8d168a';
  // we need this for adjustment tests only
  const ppfsDecreaseAllowed = true;
  // only for strategies where we expect PPFS fluctuations
  const balanceTolerance = 1;
  const finalBalanceTolerance = 0;
  const deposit = 1000;
  // at least 3
  const loops = 3;
  // number of blocks or timestamp value
  const loopValue = 300;
  // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
  const advanceBlocks = true;
  const specificTests: SpecificStrategyTest[] = [new VeMeshSpecificTests()];
  // **********************************************

  const deployer = async (signer: SignerWithAddress) => {
    const core = deployInfo.core as CoreContractsWrapper;
    const data = await StrategyTestUtils.deploy(
      signer,
      core,
      vaultName,
      async vaultAddress => {
        const strategy = await DeployerUtils.deployStrategyProxy(
          signer,
          strategyContractName,
        ) as StrategyMeshStaking;
        await strategy.initialize(core.controller.address, vaultAddress, vaultAddress);
        return strategy;
      },
      underlying
    );
    await SmartVault__factory.connect(data[0].address, signer).changeDoHardWorkOnInvest(true);
    await SmartVault__factory.connect(data[0].address, signer).changeAlwaysInvest(true);
    await core.vaultController.addRewardTokens([data[0].address], data[0].address);
    await core.vaultController.addRewardTokens([data[0].address], tetuMeshAddress);
    await core.controller.setRewardDistribution([data[1].address], true);
    return data;
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
    return new MeshStakingDoHardWork(
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
    strategyName + vaultName,
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
