import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {IStrategy, SmartVault} from "../../typechain";
import {SpecificStrategyTest} from "./SpecificStrategyTest";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../ToolsContractsWrapper";
import {universalStrategyTest} from "./UniversalStrategyTest";
import {DeployInfo} from "./DeployInfo";
import {DoHardWorkLoopBase} from "./DoHardWorkLoopBase";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startDefaultSingleTokenStrategyTest(
  strategyName: string,
  underlying: string,
  tokenName: string,
  deployInfo: DeployInfo,
  deployer: ((signer: SignerWithAddress) => Promise<[SmartVault, IStrategy, string]>) | null = null
) {
  // **********************************************
  // ************** CONFIG*************************
  // **********************************************
  const strategyContractName = strategyName;
  const vaultName = tokenName;
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
  // number of blocks or timestamp value
  const loopValue = 300;
  // use 'true' if farmable platform values depends on blocks, instead you can use timestamp
  const advanceBlocks = true;
  const specificTests: SpecificStrategyTest[] = [];
  // **********************************************

  if(deployer === null) {
    deployer = (signer: SignerWithAddress) => {
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
  }
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

  await universalStrategyTest(
    strategyName + vaultName,
    deployInfo,
    deployer as (signer: SignerWithAddress) => Promise<[SmartVault, IStrategy, string]>,
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
}

export {startDefaultSingleTokenStrategyTest};
