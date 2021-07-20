import {ethers} from "hardhat";
import chai from "chai";
import {EvilHackerContract, NoopStrategy, SmartVault} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../../MaticAddresses";
import {VaultUtils} from "../../VaultUtils";
import {BigNumber, utils} from "ethers";
import {Erc20Utils} from "../../Erc20Utils";
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
    await core.mintHelper.startMinting();
    vaultRewardToken0 = core.psVault.address;
    vault = await DeployerUtils.deploySmartVault(signer);

    strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying]) as NoopStrategy;

    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        REWARD_DURATION
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await vault.addRewardToken(vaultRewardToken0);

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

    await MintHelperUtils.mint(core.mintHelper, "1000");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signerAddress)).at.eq(utils.parseUnits("300", 18));
    const lpAddress = await UniswapUtils.addLiquidity(
        signer,
        core.rewardToken.address,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits("100", 18).toString(),
        utils.parseUnits("100", 6).toString(),
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.QUICK_ROUTER,
    );
    expect(await Erc20Utils.balanceOf(lpAddress, signerAddress)).at.eq("99999999999000");

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
      let balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);

      await VaultUtils.deposit(signer, vault, BigNumber.from("1000000"));

      let balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore - (+utils.formatUnits("1000000", 6)));

      expect(await Erc20Utils.balanceOf(vault.address, signerAddress)).at.eq("1000000");
      expect(await vault.underlyingBalanceInVault()).at.eq("0");
      expect(await vault.underlyingBalanceWithInvestment()).at.eq("1000000");
      expect(await vault.underlyingBalanceWithInvestmentForHolder(signerAddress)).at.eq("1000000");
      expect(await vault.availableToInvestOut()).at.eq("0");
      expect(await strategy.underlyingBalance()).at.eq("1000000");
      expect(await strategy.investedUnderlyingBalance()).at.eq("1000000");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("1000000");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("1");

      // ************** GOV ACTIONS *******************************
      await vault.addRewardToken(MaticAddresses.WMATIC_TOKEN);
      await vault.removeRewardToken(MaticAddresses.WMATIC_TOKEN);
      await expect(vault.removeRewardToken(core.psVault.address)).rejectedWith('last rt');

      expect(await vault.rewardTokensLength()).at.eq(1);
      await vault.doHardWork();
      await vault.rebalance();

      // ************** WITHDRAW *******************************
      balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);

      await vault.withdraw(BigNumber.from("500000"));

      balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits("500000", 6)));


      expect(await Erc20Utils.balanceOf(vault.address, signerAddress)).at.eq("500000");
      expect(await vault.underlyingBalanceInVault()).at.eq("0");
      expect(await vault.underlyingBalanceWithInvestment()).at.eq("500000");
      expect(await vault.underlyingBalanceWithInvestmentForHolder(signerAddress)).at.eq("500000");
      expect(await vault.availableToInvestOut()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("500000");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("1");

      // **************** DEPOSIT FOR ************
      balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);

      await Erc20Utils.approve(underlying, signer, vault.address, "250000");
      await vault.depositFor(BigNumber.from("250000"), signerAddress);

      balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore - (+utils.formatUnits("250000", 6)));

      expect(await Erc20Utils.balanceOf(vault.address, signerAddress)).at.eq("750000");
      expect(await vault.underlyingBalanceInVault()).at.eq("250000");

      // ************* EXIT ***************
      balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);
      const fBal = await Erc20Utils.balanceOf(vault.address, signerAddress);
      await vault.exit();

      balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signerAddress), 6);
      expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits(fBal, 6)));

      expect(await vault.underlyingBalanceWithInvestment()).at.eq("0");
      expect(await core.bookkeeper.vaultUsersBalances(vault.address, signerAddress)).at.eq("0");
      expect(await core.bookkeeper.vaultUsersQuantity(vault.address)).at.eq("0");
    });
    it("Add reward to the vault", async () => {
      await Erc20Utils.approve(core.rewardToken.address, signer,
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
      await Erc20Utils.approve(underlying, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));

      await TimeUtils.advanceBlocksOnTs(60);

      const rewardBalanceBeforeClaim = await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards before", utils.formatUnits(rewardBalanceBeforeClaim, 18));
      expect(rewardBalanceBeforeClaim).at.eq("0");
      const rewards = await vault.earned(core.psVault.address, signerAddress);
      console.log("rewards to claim", utils.formatUnits(rewards, 18));
      expect(+utils.formatUnits(rewards, 18)).at.greaterThanOrEqual(1.5);
      await vault.withdraw(BigNumber.from("1000000"));
      await vault.getReward(core.psVault.address);
      await Erc20Utils.approve(underlying, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));
      const rewardBalance = await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards balance", utils.formatUnits(rewardBalance, 18));
      expect(+utils.formatUnits(rewardBalance, 18)).at.greaterThanOrEqual(+utils.formatUnits(rewards, 18));

      // *********** notify again
      await expect(MintHelperUtils.mint(core.mintHelper, "1000"));
      await Erc20Utils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("50", 18)
      );
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).is.greaterThan(0.037);
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("50", 18)
      );
      expect(+utils.formatUnits(await vault.rewardRateForToken(vaultRewardToken0))).greaterThan(0.049);
    });
    it("Active status", async () => {
      await vault.changeActivityStatus(false);
      await expect(vault.doHardWork()).to.be.rejectedWith("not active");
    });
    it("salvage strategy", async () => {
      const strategy = await core.psVault.strategy()
      expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, strategy)).is.eq("0");
      await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, strategy, "1");
      expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, strategy)).is.eq("1");
      expect(await core.controller.salvageStrategy(strategy, MaticAddresses.USDC_TOKEN, 1))
      .is.not.eq("0");
    });
    it("should not salvage strategy", async () => {
      const strategy = await core.psVault.strategy()
      expect(await Erc20Utils.balanceOf(core.rewardToken.address, strategy)).is.eq("0");
      await Erc20Utils.transfer(core.rewardToken.address, signer, strategy, "1");
      expect(await Erc20Utils.balanceOf(core.rewardToken.address, strategy)).is.eq("1");
      await expect(core.controller.salvageStrategy(strategy, core.rewardToken.address, 1))
      .rejectedWith("not salvageable");
    });
    it("investedUnderlyingBalance with zero pool", async () => {
      expect(await core.psEmptyStrategy.investedUnderlyingBalance()).is.eq("0");
    });
    it("dummy noop tests", async () => {
      await core.psEmptyStrategy.emergencyExit();
      await core.psEmptyStrategy.withdrawAllToVault();
    });

    it("Add reward to the vault and exit", async () => {
      await Erc20Utils.approve(core.rewardToken.address, signer,
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
      await Erc20Utils.approve(underlying, signer, vault.address, "1000000");
      await vault.deposit(BigNumber.from("1000000"));

      await TimeUtils.advanceBlocksOnTs(60);

      const rewardBalanceBeforeClaim = await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards before", utils.formatUnits(rewardBalanceBeforeClaim, 18));
      expect(rewardBalanceBeforeClaim).at.eq("0");
      const rewards = await vault.earned(core.psVault.address, signerAddress);
      console.log("rewards to claim", utils.formatUnits(rewards, 18));
      expect(+utils.formatUnits(rewards, 18)).at.greaterThanOrEqual(1.5);
      await vault.exit();
      const rewardBalance = await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress);
      console.log("rewards balance", utils.formatUnits(rewardBalance, 18));
      expect(+utils.formatUnits(rewardBalance, 18)).at.greaterThanOrEqual(+utils.formatUnits(rewards, 18));

    });

    it("check reward duration vesting", async () => {
      const underlying = await vault.underlying();
      const underlyingDec = await Erc20Utils.decimals(underlying);
      const rtDecimals = await Erc20Utils.decimals(vaultRewardToken0);
      const duration = (await vault.duration()).toNumber();
      const time = 60;
      const rewards = "100";

      await VaultUtils.deposit(signer, core.psVault, utils.parseUnits(rewards));
      const xTokenBalance = await Erc20Utils.balanceOf(core.psVault.address, signerAddress);

      await Erc20Utils.approve(core.psVault.address, signer, vault.address, xTokenBalance.toString());
      await vault.notifyTargetRewardAmount(core.psVault.address, xTokenBalance);

      await VaultUtils.deposit(signer, vault, utils.parseUnits("1000", underlyingDec))

      let claimedTotal = 0;
      const cycles = duration / (time + 3);
      console.log('cycles', cycles);
      for (let i = 0; i < cycles + 1; i++) {
        await TimeUtils.advanceBlocksOnTs(time);

        const rtBalance = +utils.formatUnits(await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress), rtDecimals);
        const vaultRtBalance = +utils.formatUnits(await Erc20Utils.balanceOf(vaultRewardToken0, vault.address), rtDecimals);
        const toClaim = +utils.formatUnits(await vault.earned(vaultRewardToken0, signer.address), rtDecimals);
        console.log('toClaim', toClaim, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalance);
        expect(toClaim).is.greaterThan(0, 'to claim is zero ' + i);
        await vault.getAllRewards();

        const rtBalanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(vaultRewardToken0, signerAddress), rtDecimals);
        const claimed = rtBalanceAfter - rtBalance;
        claimedTotal += claimed;
        expect(claimed).is.greaterThan(0);
        expect(toClaim).is.approximately(claimed, claimed * 0.05, 'claimed not enough ' + i);
      }

      expect(claimedTotal).is.approximately(+utils.formatUnits(xTokenBalance), claimedTotal * 0.01, 'total claimed not enough');

      await vault.exit();
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
      await expect(vault.addRewardToken(underlying)).rejectedWith('rt is underlying');
    });

    it("should not add exist reward token", async () => {
      await expect(vault.addRewardToken(vaultRewardToken0)).rejectedWith('rt exist');
    });

    it("should not remove not exist reward token", async () => {
      await expect(vault.removeRewardToken(MaticAddresses.QUICK_TOKEN)).rejectedWith('not exist');
    });

    it("should not remove not finished reward token", async () => {
      await Erc20Utils.approve(core.rewardToken.address, signer,
          core.feeRewardForwarder.address, utils.parseUnits("100", 18).toString());
      await core.feeRewardForwarder.notifyCustomPool(
          core.rewardToken.address,
          vault.address,
          utils.parseUnits("100", 18)
      );
      await expect(vault.removeRewardToken(vaultRewardToken0)).rejectedWith('not finished');
    });

    it("tests without strategy", async () => {
      const vault1 = await DeployerUtils.deploySmartVault(signer);
      await vault1.initializeSmartVault(
          "NOOP",
          "tNOOP",
          core.controller.address,
          underlying,
          REWARD_DURATION
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
