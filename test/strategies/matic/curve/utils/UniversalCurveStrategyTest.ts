import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployInfo} from "../../../DeployInfo";
import {SpecificStrategyTest} from "../../../SpecificStrategyTest";
import {CoreContractsWrapper} from "../../../../CoreContractsWrapper";
import {StrategyTestUtils} from "../../../StrategyTestUtils";
import {DeployerUtils} from "../../../../../scripts/deploy/DeployerUtils";
import {IStrategy, SmartVault} from "../../../../../typechain";
import {ToolsContractsWrapper} from "../../../../ToolsContractsWrapper";
import {universalStrategyTest} from "../../../UniversalStrategyTest";
import {CurveDoHardWork} from "./CurveDoHardWork";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startCurveStratTest(
  strategyName: string,
  underlying: string,
  tokenName: string,
  deployInfo: DeployInfo,
  deposit = 100_000,
  loopValue = 3000,
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
  // at least 3
  const loops = 3;
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
          underlying,
          vaultAddress,
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
    return new CurveDoHardWork(
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

export {startCurveStratTest};
