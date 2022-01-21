import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { MaticAddresses } from "../../../../scripts/addresses/MaticAddresses";
import { config as dotEnvConfig } from "dotenv";
import { StrategyTestUtils } from "../../StrategyTestUtils";
import { DeployInfo } from "../../DeployInfo";
import { SpecificStrategyTest } from "../../SpecificStrategyTest";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CoreContractsWrapper } from "../../../CoreContractsWrapper";
import { DeployerUtils } from "../../../../scripts/deploy/DeployerUtils";
import {
  ForwarderV2,
  IStrategy,
  SmartVault,
  SmartVault__factory,
} from "../../../../typechain";
import { ToolsContractsWrapper } from "../../../ToolsContractsWrapper";
import { universalStrategyTest } from "../../UniversalStrategyTest";
import { KlimaStakingDoHardWork } from "./KlimaStakingDoHardWork";

dotEnvConfig();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argv = require("yargs/yargs")()
  .env("TETU")
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
      default: 137,
    },
  }).argv;

const { expect } = chai;
chai.use(chaiAsPromised);

describe("Klima staking tests", async () => {
  if (argv.disableStrategyTests || argv.hardhatChainId !== 137) {
    return;
  }
  const underlying = MaticAddresses.KLIMA_TOKEN;
  const strategyName = "StrategyKlimaStaking";
  const tokenName = "KLIMA";

  const deployInfo: DeployInfo = new DeployInfo();
  before(async function () {
    await StrategyTestUtils.deployCoreAndInit(
      deployInfo,
      argv.deployCoreContracts
    );
  });

  // **********************************************
  // ************** CONFIG*************************
  // **********************************************
  const strategyContractName = strategyName;
  const vaultName = tokenName;
  // const underlying = token;
  // add custom liquidation path if necessary
  const forwarderConfigurator = async (f: ForwarderV2) => {
    await f.addLargestLps(
      [MaticAddresses.KLIMA_TOKEN, MaticAddresses.BCT_TOKEN],
      [
        "0x9803c7aE526049210a1725F7487AF26fE2c24614",
        "0x1E67124681b402064CD0ABE8ed1B5c79D2e02f64",
      ]
    );
  };
  // only for strategies where we expect PPFS fluctuations
  const ppfsDecreaseAllowed = false;
  // only for strategies where we expect PPFS fluctuations
  const balanceTolerance = 0.00000001;
  const finalBalanceTolerance = 0.00000001;
  const deposit = 100_000;
  // at least 3
  const loops = 20;
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
      async (vaultAddress) => {
        const strategyArgs = [
          core.controller.address,
          vaultAddress,
          underlying,
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
    return new KlimaStakingDoHardWork(
      _signer,
      _user,
      _core,
      _tools,
      _underlying,
      _vault,
      _strategy,
      _balanceTolerance,
      finalBalanceTolerance
    );
  };

  await universalStrategyTest(
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
    specificTests
  );
});
