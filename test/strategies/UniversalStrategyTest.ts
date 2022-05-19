import {ethers} from "hardhat";
import {ToolsContractsWrapper} from "../ToolsContractsWrapper";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {
  ForwarderV2,
  IStrategy,
  PriceCalculator,
  SmartVault,
  SmartVault__factory
} from "../../typechain";
import {VaultUtils} from "../VaultUtils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {DoHardWorkLoopBase} from "./DoHardWorkLoopBase";
import {DeployInfo} from "./DeployInfo";
import {SpecificStrategyTest} from "./SpecificStrategyTest";
import {BigNumber} from "ethers";
import {UniswapUtils} from "../UniswapUtils";
import {TokenUtils} from "../TokenUtils";

async function universalStrategyTest(
  name: string,
  deployInfo: DeployInfo,
  deployer: (signer: SignerWithAddress) => Promise<[SmartVault, IStrategy, string]>,
  hardworkInitiator: (
    signer: SignerWithAddress,
    user: SignerWithAddress,
    core: CoreContractsWrapper,
    tools: ToolsContractsWrapper,
    underlying: string,
    vault: SmartVault,
    strategy: IStrategy,
    balanceTolerance: number
  ) => DoHardWorkLoopBase,
  forwarderConfigurator: ((forwarder: ForwarderV2) => Promise<void>) | null = null,
  ppfsDecreaseAllowed = false,
  balanceTolerance = 0,
  deposit = 100_000,
  loops = 9,
  loopValue = 300,
  advanceBlocks = true,
  specificTests: SpecificStrategyTest[] | null = null,
) {

  describe(name + "_Test", async function () {
    let snapshotBefore: string;
    let snapshot: string;
    let signer: SignerWithAddress;
    let user: SignerWithAddress;
    let underlying: string;
    let vault: SmartVault;
    let strategy: IStrategy;
    let userBalance: BigNumber;

    before(async function () {
      const start = Date.now();
      snapshotBefore = await TimeUtils.snapshot();
      signer = await DeployerUtils.impersonate();
      user = (await ethers.getSigners())[1];
      const core = deployInfo.core as CoreContractsWrapper;

      const data = await deployer(signer);
      vault = data[0];
      strategy = data[1];
      underlying = await vault.underlying();

      if (forwarderConfigurator !== null) {
        await forwarderConfigurator(core.feeRewardForwarder);
      }
      if (ppfsDecreaseAllowed) {
        await core.vaultController.changePpfsDecreasePermissions([vault.address], true);
      }
      await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

      // set class variables for keep objects links
      deployInfo.signer = signer;
      deployInfo.user = user;
      deployInfo.underlying = underlying;
      deployInfo.vault = vault;
      deployInfo.strategy = strategy;

      // get underlying
      if (await core.controller.isValidVault(underlying)) {
        console.log('underlying is a vault, need to wrap into xToken');
        const svUnd = SmartVault__factory.connect(underlying, signer);
        const svUndToken = await svUnd.underlying();
        const svUndTokenBal = await StrategyTestUtils.getUnderlying(
          svUndToken,
          deposit,
          user,
          deployInfo?.tools?.calculator as PriceCalculator,
          [signer.address],
        );
        console.log('svUndTokenBal', svUndTokenBal.toString());
        await VaultUtils.deposit(signer, svUnd, svUndTokenBal);
        await VaultUtils.deposit(user, svUnd, svUndTokenBal);
        userBalance = await TokenUtils.balanceOf(underlying, signer.address);
      } else {
        userBalance = await StrategyTestUtils.getUnderlying(
          underlying,
          deposit,
          user,
          deployInfo?.tools?.calculator as PriceCalculator,
          [signer.address],
        );
      }
      await UniswapUtils.wrapNetworkToken(this.signer);
      Misc.printDuration('Test Preparations completed', start);
    });

    beforeEach(async function () {
      snapshot = await TimeUtils.snapshot();
    });

    afterEach(async function () {
      await TimeUtils.rollback(snapshot);
    });

    after(async function () {
      await TimeUtils.rollback(snapshotBefore);
    });

    it("doHardWork loop", async function () {
      const core = deployInfo.core as CoreContractsWrapper;
      const tools = deployInfo.tools as ToolsContractsWrapper;
      await hardworkInitiator(
        signer,
        user,
        core,
        tools,
        underlying,
        vault,
        strategy,
        balanceTolerance,
      ).start(userBalance, loops, loopValue, advanceBlocks);
    });

    it("common test should be ok", async () => {
      await StrategyTestUtils.commonTests(strategy, underlying);
    });

    if (specificTests) {
      specificTests?.forEach(test => test.do(deployInfo));
    }
  });
}

export {universalStrategyTest};
