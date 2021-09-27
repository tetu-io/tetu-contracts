import {ethers} from "hardhat";
import chai from "chai";
import {EvilHackerContract, NoopStrategy, SmartVault} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../../MaticAddresses";
import {VaultUtils} from "../../VaultUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {MintHelperUtils} from "../../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

const TO_INVEST_NUMERATOR = 9700;
const TO_INVEST_DENOMINATOR = 10000;
const REWARD_DURATION = 60 * 60;

describe("SmartVaultNoopStrat", () => {
  let snapshot: string;
  let snapshotForEach: string;
  const underlying = MaticAddresses.USDC_TOKEN;
  let signer: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let vault: SmartVault;
  let strategy: NoopStrategy;
  let vaultRewardToken0: string;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signerAddress = signer.address;

    core = await DeployerUtils.deployAllCoreContracts(signer);
    vaultRewardToken0 = core.psVault.address;
    vault = await DeployerUtils.deploySmartVault(signer);

    strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying], 1) as NoopStrategy;

    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        REWARD_DURATION,
        false,
        MaticAddresses.ZERO_ADDRESS
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await core.vaultController.addRewardTokens([vault.address], vaultRewardToken0);

    await new VaultUtils(vault).checkEmptyVault(
        strategy.address,
        underlying,
        vaultRewardToken0,
        signerAddress,
        TO_INVEST_NUMERATOR,
        TO_INVEST_DENOMINATOR,
        REWARD_DURATION
    );

    await UniswapUtils.wrapMatic(signer);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER,
        MaticAddresses.USDC_TOKEN, utils.parseUnits("10000", 18))

    await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signerAddress)).at.eq(utils.parseUnits("1000", 18));
    const lpAddress = await UniswapUtils.addLiquidity(
        signer,
        core.rewardToken.address,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits("100", 18).toString(),
        utils.parseUnits("100", 6).toString(),
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.QUICK_ROUTER,
    );
    expect(await TokenUtils.balanceOf(lpAddress, signerAddress)).at.eq("99999999999000");

    await core.feeRewardForwarder.setConversionPath(
        [core.rewardToken.address, MaticAddresses.USDC_TOKEN],
        [MaticAddresses.QUICK_ROUTER]
    );
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
      let balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);

      await VaultUtils.deposit(signer, vault, BigNumber.from("1000000"));

      let balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);
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
      await core.vaultController.addRewardTokens([vault.address], MaticAddresses.WMATIC_TOKEN);
      await core.vaultController.removeRewardTokens([vault.address], MaticAddresses.WMATIC_TOKEN);
      await expect(core.vaultController.removeRewardTokens([vault.address], core.psVault.address)).rejectedWith('last rt');

      expect(await vault.rewardTokensLength()).at.eq(1);
      await vault.doHardWork();
      await vault.rebalance();

      // ************** WITHDRAW *******************************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);

      await vault.withdraw(BigNumber.from("500000"));

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits("500000", 6)));


      expect(await TokenUtils.balanceOf(vault.address, signerAddress)).at.eq("500000");
      expect(await vault.underlyingBalanceInVault()).at.eq("0");
      expect(await vault.underlyingBalanceWithInvestment()).at.eq("500000");
      expect(await vault.underlyingBalanceWithInvestmentForHolder(signerAddress)).at.eq("500000");
      expect(await vault.availableToInvestOut()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("500000");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("1");

      // **************** DEPOSIT FOR ************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);

      await TokenUtils.approve(underlying, signer, vault.address, "250000");
      await vault.depositFor(BigNumber.from("250000"), signerAddress);

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore - (+utils.formatUnits("250000", 6)));

      expect(await TokenUtils.balanceOf(vault.address, signerAddress)).at.eq("750000");
      expect(await vault.underlyingBalanceInVault()).at.eq("250000");

      // ************* EXIT ***************
      balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);
      const fBal = await TokenUtils.balanceOf(vault.address, signerAddress);
      await vault.exit();

      balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits(fBal, 6)));

      expect(await vault.underlyingBalanceWithInvestment()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("0");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("0");
    });
    it("Add reward to the vault", async () => {
      await TokenUtils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("100", 18)
      );
      expect(await vault.rewardRateForToken(vaultRewardToken0)).at.eq("25000000000000000");
      expect(await vault.rewardPerToken(vaultRewardToken0)).to.eq(0);
      expect((await vault.periodFinishForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect((await vault.lastUpdateTimeForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect(await vault.rewardPerTokenStoredForToken(vaultRewardToken0)).to.eq(0);
      expect(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, core.fundKeeper.address))
      .is.eq(9066108);

      // ***************** CLAIM REWARDS ****************
      await TokenUtils.approve(underlying, signer, vault.address, "1000000");
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
      await TokenUtils.approve(underlying, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));
      const rewardBalance = await TokenUtils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards balance", utils.formatUnits(rewardBalance, 18));
      expect(+utils.formatUnits(rewardBalance, 18)).at.greaterThanOrEqual(+utils.formatUnits(rewards, 18));

      // *********** notify again
      await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);
      await TokenUtils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("50", 18)
      );
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).is.greaterThan(0.01);
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("50", 18)
      );
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).greaterThan(0.02);
    });
    it("Active status", async () => {
      await core.vaultController.changeVaultsStatuses([vault.address], [false]);
      await expect(vault.doHardWork()).to.be.rejectedWith("not active");
    });
    it("investedUnderlyingBalance with zero pool", async () => {
      expect(await core.psEmptyStrategy.investedUnderlyingBalance()).is.eq("0");
    });
    it("dummy noop tests", async () => {
      await core.psEmptyStrategy.emergencyExit();
      await core.psEmptyStrategy.withdrawAllToVault();
      await core.psEmptyStrategy.readyToClaim();
      await core.psEmptyStrategy.poolTotalAmount();
      await core.psEmptyStrategy.poolWeeklyRewardsAmount();
    });

    it("Add reward to the vault and exit", async () => {
      await TokenUtils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("100", 18)
      );
      expect(await vault.rewardRateForToken(vaultRewardToken0)).at.eq("25000000000000000");
      expect(await vault.rewardPerToken(vaultRewardToken0)).to.eq(0);
      expect((await vault.periodFinishForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect((await vault.lastUpdateTimeForToken(vaultRewardToken0)).toNumber()).is.not.eq(0);
      expect(await vault.rewardPerTokenStoredForToken(vaultRewardToken0)).to.eq(0);

      // ***************** CLAIM REWARDS ****************
      await TokenUtils.approve(underlying, signer, vault.address, "1000000");
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
      await expect(core.psVault.connect((await ethers.getSigners())[1]).doHardWork()).is.rejectedWith("not controller");
    });

    it("should not deposit from contract", async () => {
      const extUser = (await ethers.getSigners())[1];
      const contract = await DeployerUtils.deployContract(extUser, 'EvilHackerContract') as EvilHackerContract;
      await expect(contract.tryDeposit(vault.address, '1000000')).is.rejectedWith('not allowed');
    });

    it("should not notify from ext user", async () => {
      const extUser = (await ethers.getSigners())[1];
      await expect(vault.connect(extUser).notifyTargetRewardAmount(vaultRewardToken0, '1111111')).is.rejectedWith('only distr');
    });

    it("should not doHardWork on strat from ext user", async () => {
      const extUser = (await ethers.getSigners())[1];
      await expect(strategy.connect(extUser).doHardWork()).is.rejectedWith('forbidden');
    });

    it("should not doHardWork for paused strat", async () => {
      await strategy.emergencyExit();
      await expect(strategy.doHardWork()).is.rejectedWith('paused');
    });

    it("should not add underlying reward token", async () => {
      await expect(core.vaultController.addRewardTokens([vault.address], underlying)).rejectedWith('rt is underlying');
    });

    it("should not add exist reward token", async () => {
      await expect(core.vaultController.addRewardTokens([vault.address], vaultRewardToken0)).rejectedWith('rt exist');
    });

    it("should not remove not exist reward token", async () => {
      await expect(core.vaultController.removeRewardTokens([vault.address], MaticAddresses.QUICK_TOKEN)).rejectedWith('not exist');
    });

    it("should not remove not finished reward token", async () => {
      await TokenUtils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("100", 18)
      );
      await expect(core.vaultController.removeRewardTokens([vault.address], vaultRewardToken0)).rejectedWith('not finished');
    });

    it("tests without strategy", async () => {
      const vault1 = await DeployerUtils.deploySmartVault(signer);
      await vault1.initializeSmartVault(
          "NOOP",
          "tNOOP",
          core.controller.address,
          underlying,
          REWARD_DURATION,
          false,
          MaticAddresses.ZERO_ADDRESS
      );
      expect(await vault1.underlyingBalanceWithInvestment()).is.eq(0);
      await expect(vault1.doHardWork()).rejectedWith('zero strat')
    });

    it("should not withdraw when supply is zero", async () => {
      await expect(vault.withdraw(1)).rejectedWith('no shares');
    });

    it("should not withdraw zero amount", async () => {
      await VaultUtils.deposit(signer, vault, BigNumber.from("1"));
      await expect(vault.withdraw(0)).rejectedWith('zero amount');
    });

    it("should not deposit zero amount", async () => {
      await expect(vault.deposit(0)).rejectedWith('zero amount');
    });

    it("should not deposit for zero address", async () => {
      await expect(vault.depositFor(1, MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero beneficiary');
    });

    it("rebalance with zero amount", async () => {
      await vault.rebalance();
    });

    it("should not notify with amount overflow", async () => {
      await expect(vault.notifyTargetRewardAmount(
          core.rewardToken.address,
          '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      )).rejectedWith('amount overflow');
    });

    it("should not notify with unknown token", async () => {
      await expect(vault.notifyTargetRewardAmount(
          MaticAddresses.ZERO_ADDRESS,
          '1'
      )).rejectedWith('rt not found');
    });

  });
});
