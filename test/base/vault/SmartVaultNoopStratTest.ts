import {ethers} from "hardhat";
import chai from "chai";
import {EvilHackerContract, NoopStrategy, SmartVault} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {VaultUtils} from "../../VaultUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {MintHelperUtils} from "../../MintHelperUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

const TO_INVEST_NUMERATOR = 9700;
const TO_INVEST_DENOMINATOR = 10000;
const REWARD_DURATION = 60 * 60;

describe("SmartVaultNoopStrat", () => {
  let snapshot: string;
  let snapshotForEach: string;

  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let vault: SmartVault;
  let strategy: NoopStrategy;
  let vaultRewardToken0: string;
  let networkToken: string;
  let usdc: string;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();

    core = await DeployerUtils.deployAllCoreContracts(signer);
    vaultRewardToken0 = core.psVault.address;
    vault = await DeployerUtils.deploySmartVault(signer);

    strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller.address, usdc, vault.address, [Misc.ZERO_ADDRESS], [usdc], 1) as NoopStrategy;

    await vault.initializeSmartVault(
      "NOOP",
      "tNOOP",
      core.controller.address,
      usdc,
      REWARD_DURATION,
      false,
      Misc.ZERO_ADDRESS,
      0
    );
    await core.controller.addVaultsAndStrategies([vault.address], [strategy.address]);
    await core.vaultController.addRewardTokens([vault.address], vaultRewardToken0);
    await core.vaultController.setToInvest([vault.address], 1000);

    await new VaultUtils(vault).checkEmptyVault(
      strategy.address,
      usdc,
      vaultRewardToken0,
      signerAddress,
      TO_INVEST_NUMERATOR,
      TO_INVEST_DENOMINATOR,
      REWARD_DURATION
    );

    await UniswapUtils.wrapNetworkToken(signer);
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits("1000000", 6))
    await TokenUtils.getToken(usdc, user.address, utils.parseUnits("1000000", 6))
    await TokenUtils.wrapNetworkToken(signer, '10000000');

    await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signerAddress)).at.eq(utils.parseUnits("1000", 18));
    const lpAddress = await UniswapUtils.addLiquidity(
      signer,
      core.rewardToken.address,
      usdc,
      utils.parseUnits("100", 18).toString(),
      utils.parseUnits("100", 6).toString(),
      await DeployerUtils.getDefaultNetworkFactory(),
      await DeployerUtils.getRouterByFactory(await DeployerUtils.getDefaultNetworkFactory())
    );
    expect(await TokenUtils.balanceOf(lpAddress, signerAddress)).at.eq("99999999999000");

    // await StrategyTestUtils.initForwarder(core.feeRewardForwarder);
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });

  describe("Empty SmartVault Base functionality", async () => {
    it("Check base functions", async () => {
      // const vaultUtils = new VaultUtils(vault);

      // ************** DEPOSIT *******************************
      let balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);

      await VaultUtils.deposit(signer, vault, BigNumber.from("1000000"));

      let balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);
      expect(balanceAfter.toFixed(6)).is.eq((balanceBefore - (+utils.formatUnits("1000000", 6))).toFixed(6));

      expect(await TokenUtils.balanceOf(vault.address, signerAddress)).at.eq("1000000");
      expect(await vault.underlyingBalanceInVault()).at.eq("0");
      expect(await vault.underlyingBalanceWithInvestment()).at.eq("1000000");
      expect(await vault.underlyingBalanceWithInvestmentForHolder(signerAddress)).at.eq("1000000");
      expect(await vault.availableToInvestOut()).at.eq("0");
      expect(await strategy.underlyingBalance()).at.eq("1000000");
      expect(await strategy.investedUnderlyingBalance()).at.eq("1000000");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("1000000");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("1");

      // ************** GOV ACTIONS *******************************
      await core.vaultController.addRewardTokens([vault.address], networkToken);
      await core.vaultController.removeRewardTokens([vault.address], networkToken);
      await expect(core.vaultController.removeRewardTokens([vault.address], core.psVault.address)).rejectedWith('');

      expect(await vault.rewardTokensLength()).at.eq(1);
      await vault.doHardWork();

      // ************** WITHDRAW *******************************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);

      await vault.withdraw(BigNumber.from("500000"));

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits("500000", 6)));


      expect(await TokenUtils.balanceOf(vault.address, signerAddress)).at.eq("500000");
      expect(await vault.underlyingBalanceInVault()).at.eq("0");
      expect(await vault.underlyingBalanceWithInvestment()).at.eq("500000");
      expect(await vault.underlyingBalanceWithInvestmentForHolder(signerAddress)).at.eq("500000");
      expect(await vault.availableToInvestOut()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("500000");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("1");

      // **************** DEPOSIT FOR ************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);

      await TokenUtils.approve(usdc, signer, vault.address, "250000");
      await vault.depositFor(BigNumber.from("250000"), signerAddress);

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore - (+utils.formatUnits("250000", 6)));

      expect(await TokenUtils.balanceOf(vault.address, signerAddress)).at.eq("750000");
      expect(await vault.underlyingBalanceInVault()).at.eq("250000");

      // ************* EXIT ***************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);
      const fBal = await TokenUtils.balanceOf(vault.address, signerAddress);
      await vault.exit();

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits(fBal, 6)));

      expect(await vault.underlyingBalanceWithInvestment()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("0");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("0");
    });
    it("Add reward to the vault", async () => {
      await VaultUtils.addRewardsXTetu(signer, vault, core, 100);
      expect(await vault.rewardRateForToken(vaultRewardToken0)).is.not.eq(0);
      expect(await vault.rewardPerToken(vaultRewardToken0)).to.eq(0);
      expect((await vault.periodFinishForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect((await vault.lastUpdateTimeForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect(await vault.rewardPerTokenStoredForToken(vaultRewardToken0)).to.eq(0);

      // ***************** CLAIM REWARDS ****************
      await TokenUtils.approve(usdc, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));

      await TimeUtils.advanceBlocksOnTs(60);

      const rewardBalanceBeforeClaim = await TokenUtils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards before", utils.formatUnits(rewardBalanceBeforeClaim, 18));
      expect(rewardBalanceBeforeClaim).at.eq("0");
      const rewards = await vault.earnedWithBoost(core.psVault.address, signerAddress);
      console.log("rewards to claim", utils.formatUnits(rewards, 18));
      expect(+utils.formatUnits(rewards, 18)).at.greaterThanOrEqual(0.45);
      await vault.withdraw(BigNumber.from("1000000"));
      await vault.getReward(core.psVault.address);
      await TokenUtils.approve(usdc, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));
      const rewardBalance = await TokenUtils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards balance", utils.formatUnits(rewardBalance, 18));
      expect(+utils.formatUnits(rewardBalance, 18)).at.greaterThanOrEqual(+utils.formatUnits(rewards, 18));

      // *********** notify again
      await VaultUtils.addRewardsXTetu(signer, vault, core, 50);
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).is.greaterThan(0.01);

      await VaultUtils.addRewardsXTetu(signer, vault, core, 50);
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).greaterThan(0.013);
    });
    it("Active status", async () => {
      await core.vaultController.changeVaultsStatuses([vault.address], [false]);
      await TokenUtils.approve(usdc, signer, vault.address, "1000000");
      await expect(vault.deposit(BigNumber.from("1000000"))).rejectedWith('SV: Not active');
    });
    it("investedUnderlyingBalance with zero pool", async () => {
      expect(await core.psEmptyStrategy.investedUnderlyingBalance()).is.eq("0");
    });
    it("dummy noop tests", async () => {
      await core.psEmptyStrategy.emergencyExit();
      await core.psEmptyStrategy.withdrawAllToVault();
      await core.psEmptyStrategy.readyToClaim();
      await core.psEmptyStrategy.poolTotalAmount();
    });

    it("Add reward to the vault and exit", async () => {
      await VaultUtils.addRewardsXTetu(signer, vault, core, 100);
      expect(await vault.rewardRateForToken(vaultRewardToken0)).at.eq("27777777777777777");
      expect(await vault.rewardPerToken(vaultRewardToken0)).to.eq(0);
      expect((await vault.periodFinishForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect((await vault.lastUpdateTimeForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect(await vault.rewardPerTokenStoredForToken(vaultRewardToken0)).to.eq(0);

      // ***************** CLAIM REWARDS ****************
      await TokenUtils.approve(usdc, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));

      await TimeUtils.advanceBlocksOnTs(60);

      const rewardBalanceBeforeClaim = await TokenUtils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards before", utils.formatUnits(rewardBalanceBeforeClaim, 18));
      expect(rewardBalanceBeforeClaim).at.eq("0");
      const rewards = await vault.earnedWithBoost(core.psVault.address, signerAddress);
      console.log("rewards to claim", utils.formatUnits(rewards, 18));
      expect(+utils.formatUnits(rewards, 18)).at.greaterThanOrEqual(0.45);
      await vault.exit();
      const rewardBalance = await TokenUtils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards balance", utils.formatUnits(rewardBalance, 18));
      expect(+utils.formatUnits(rewardBalance, 18)).at.greaterThanOrEqual(+utils.formatUnits(rewards, 18));

    });

    it("should not doHardWork from users", async () => {
      await expect(core.psVault.connect((await ethers.getSigners())[1]).doHardWork()).is.rejectedWith("SV: Not controller or gov");
    });

    it("should not deposit from contract", async () => {
      const extUser = (await ethers.getSigners())[1];
      const contract = await DeployerUtils.deployContract(extUser, 'EvilHackerContract') as EvilHackerContract;
      await expect(contract.tryDeposit(vault.address, '1000000')).is.rejectedWith('SV: Not allowed');
    });

    it("should not notify from ext user", async () => {
      const extUser = (await ethers.getSigners())[1];
      await expect(vault.connect(extUser).notifyTargetRewardAmount(vaultRewardToken0, '1111111')).is.rejectedWith('SV: Only distributor');
    });

    it("should not doHardWork on strat from ext user", async () => {
      const extUser = (await ethers.getSigners())[1];
      await expect(strategy.connect(extUser).doHardWork()).is.rejectedWith('SB: Not Gov or Vault');
    });

    it("should not doHardWork for paused strat", async () => {
      await strategy.emergencyExit();
      await expect(strategy.doHardWork()).is.rejectedWith('SB: Paused');
    });

    it("should not add underlying reward token", async () => {
      await expect(core.vaultController.addRewardTokens([vault.address], usdc)).rejectedWith('');
    });

    it("should not add exist reward token", async () => {
      await expect(core.vaultController.addRewardTokens([vault.address], vaultRewardToken0)).rejectedWith('');
    });

    it("should not remove not exist reward token", async () => {
      await expect(core.vaultController.removeRewardTokens([vault.address], networkToken)).rejectedWith('');
    });

    it("should not remove not finished reward token", async () => {
      await TokenUtils.approve(core.rewardToken.address, signer,
        core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await VaultUtils.addRewardsXTetu(signer, vault, core, 100);
      await expect(core.vaultController.removeRewardTokens([vault.address], vaultRewardToken0)).rejectedWith('');
    });

    it("tests without strategy", async () => {
      const vault1 = await DeployerUtils.deploySmartVault(signer);
      await vault1.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        usdc,
        REWARD_DURATION,
        false,
        Misc.ZERO_ADDRESS,
        0
      );
      expect(await vault1.underlyingBalanceWithInvestment()).is.eq(0);
      await expect(vault1.doHardWork()).rejectedWith('')
    });

    it("should not withdraw when supply is zero", async () => {
      await expect(vault.withdraw(1)).rejectedWith('SV: No shares for withdraw');
    });

    it("should not withdraw zero amount", async () => {
      await VaultUtils.deposit(signer, vault, BigNumber.from("1"));
      await expect(vault.withdraw(0)).rejectedWith('SV: Zero amount for withdraw');
    });

    it("should not deposit zero amount", async () => {
      await expect(vault.deposit(0)).rejectedWith('SV: Zero amount');
    });

    it("should not deposit for zero address", async () => {
      await expect(vault.depositFor(1, Misc.ZERO_ADDRESS)).rejectedWith('SV: Zero beneficiary for deposit');
    });

    it("rebalance with zero amount", async () => {
      await core.vaultController.rebalance([vault.address]);
    });

    it("should not notify with amount overflow", async () => {
      await expect(vault.notifyTargetRewardAmount(
        core.rewardToken.address,
        '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      )).rejectedWith('SV: Amount overflow');
    });

    it("should not notify with unknown token", async () => {
      await expect(vault.notifyTargetRewardAmount(
        Misc.ZERO_ADDRESS,
        '1'
      )).rejectedWith('SV: RT not found');
    });

    it("tests deposit fee", async () => {
      const vault1 = await DeployerUtils.deploySmartVault(signer);
      await vault1.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        usdc,
        REWARD_DURATION,
        false,
        Misc.ZERO_ADDRESS,
        50
      );
      const vWallet = await DeployerUtils.impersonate(vault1.address);

      const signerBalBefore = await TokenUtils.balanceOf(usdc, signerAddress);
      const userBalBefore = await TokenUtils.balanceOf(usdc, user.address);

      await VaultUtils.deposit(signer, vault1, BigNumber.from("10000"), false);
      expect(await TokenUtils.balanceOf(usdc, vault1.address)).is.eq(BigNumber.from(10000));
      // simulate invest to strategy with fee
      await TokenUtils.transfer(usdc, vWallet, core.vaultController.address, '50');
      expect(await TokenUtils.balanceOf(usdc, vault1.address)).is.eq(BigNumber.from(9950));
      const shareBalSigner = await TokenUtils.balanceOf(vault1.address, signerAddress);
      const undBalSigner = await vault1.underlyingBalanceWithInvestmentForHolder(signer.address);
      expect(shareBalSigner).is.eq(BigNumber.from("9950"))
      expect(undBalSigner).is.eq(BigNumber.from("9950"))


      await VaultUtils.deposit(user, vault1, BigNumber.from("10000"), false);
      // simulate invest to strategy with fee
      await TokenUtils.transfer(usdc, vWallet, core.vaultController.address, '50');
      const shareBalUser = await TokenUtils.balanceOf(vault1.address, signerAddress);
      const undBalUser = await vault1.underlyingBalanceWithInvestmentForHolder(user.address);
      expect(shareBalUser).is.eq(BigNumber.from("9950"))
      expect(undBalUser).is.eq(BigNumber.from("9950"))
      // should be the same
      expect(undBalSigner).is.eq(BigNumber.from("9950"))

      await vault1.connect(signer).exit();
      await vault1.connect(user).exit();

      const signerBalAfter = await TokenUtils.balanceOf(usdc, signerAddress);
      const userBalAfter = await TokenUtils.balanceOf(usdc, user.address);
      expect(signerBalBefore.sub(50)).is.eq(signerBalAfter);
      expect(userBalBefore.sub(50)).is.eq(userBalAfter);
    });

  });
});
