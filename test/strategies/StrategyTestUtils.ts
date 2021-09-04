import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../MaticAddresses";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {IStrategy, SmartVault} from "../../typechain";
import {Erc20Utils} from "../Erc20Utils";
import {BigNumber, utils} from "ethers";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";
import {StrategyInfo} from "./StrategyInfo";
import {ethers} from "hardhat";
import {VaultUtils} from "../VaultUtils";

export class StrategyTestUtils {
  public static readonly SECONDS_OF_DAY = 60 * 60 * 24;
  public static readonly SECONDS_OF_YEAR = StrategyTestUtils.SECONDS_OF_DAY * 365;

  public static async deploy(
      signer: SignerWithAddress,
      core: CoreContractsWrapper,
      vaultName: string,
      strategyDeployer: (vaultAddress: string) => Promise<IStrategy>,
      underlying: string
  ): Promise<any[]> {

    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
        vaultName,
        strategyDeployer,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    );

    const vault = data[1] as SmartVault;
    const strategy = data[2] as IStrategy;


    const rewardTokenLp = await UniswapUtils.createPairForRewardToken(
        signer, core, "1000000"
    );

    expect((await strategy.underlying()).toLowerCase()).is.eq(underlying);
    expect((await vault.underlying()).toLowerCase()).is.eq(underlying);

    return [vault, strategy, rewardTokenLp];
  }

  public static async doHardWorkWithLiqPath(info: StrategyInfo, deposit: string, toClaimCalcFunc: () => Promise<BigNumber[]>) {
    const den = (await info.core.controller.psDenominator()).toNumber();
    const newNum = +(den / 2).toFixed()
    console.log('new ps ratio', newNum, den)
    await info.core.announcer.announceRatioChange(9, newNum, den);
    await TimeUtils.advanceBlocksOnTs(1);
    await info.core.controller.setPSNumeratorDenominator(newNum, den);

    const vaultForUser = info.vault.connect(info.user);

    const rt0 = (await vaultForUser.rewardTokens())[0];

    const userUnderlyingBalance = await Erc20Utils.balanceOf(info.underlying, info.user.address);

    console.log("deposit", deposit);
    await VaultUtils.deposit(info.user, info.vault, BigNumber.from(deposit));

    const rewardBalanceBefore = await Erc20Utils.balanceOf(info.core.psVault.address, info.user.address);
    const vaultBalanceBefore = await Erc20Utils.balanceOf(info.core.psVault.address, info.vault.address);
    const psBalanceBefore = await Erc20Utils.balanceOf(info.core.rewardToken.address, info.core.psVault.address);
    const userEarnedTotal = await info.core.bookkeeper.userEarned(info.user.address, info.vault.address, rt0);

    // *********** TIME MACHINE GO BRRRRR***********
    await TimeUtils.advanceBlocksOnTs(60 * 60); // 1 hour

    // ** calculate to claim
    let totalToClaim = 0;
    if (toClaimCalcFunc != null) {
      const targetTokenPrice = +utils.formatUnits(await info.calculator.getPriceWithDefaultOutput(info.core.rewardToken.address));
      console.log('targetTokenPrice', targetTokenPrice);
      const toClaim = await toClaimCalcFunc();
      const rts = await info.strategy.rewardTokens();
      for (let i = 0; i < toClaim.length; i++) {
        const rt = rts[i];
        const rtDec = await Erc20Utils.decimals(rt);
        const rtPrice = +utils.formatUnits(await info.calculator.getPriceWithDefaultOutput(rt));
        const rtAmount = +utils.formatUnits(toClaim[i], rtDec) * rtPrice / targetTokenPrice;
        console.log('toClaim', i, rtAmount, +utils.formatUnits(toClaim[i], rtDec), rtPrice);
        totalToClaim += rtAmount;
      }
    }

    // ** doHardWork
    await info.vault.doHardWork();


    const earned = +utils.formatUnits(await info.core.bookkeeper.targetTokenEarned(info.strategy.address));
    expect(earned).is.not.equal(0);
    // ** check to claim
    if (toClaimCalcFunc != null) {
      console.log('earned', earned, totalToClaim);
      expect(earned).is.approximately(totalToClaim, totalToClaim * 2); // very approximately
    }

    await StrategyTestUtils.checkStrategyRewardsBalance(info.strategy, ['0', '0']);

    // check vault balance
    const vaultBalanceAfter = await Erc20Utils.balanceOf(info.core.psVault.address, info.vault.address);
    expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");

    // check ps balance
    const psBalanceAfter = await Erc20Utils.balanceOf(info.core.rewardToken.address, info.core.psVault.address);
    expect(psBalanceAfter.sub(psBalanceBefore)).is.not.eq("0", "ps balance should increase");

    // check reward for user
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7); // 1 week
    await vaultForUser.getAllRewards();
    const rewardBalanceAfter = await Erc20Utils.balanceOf(info.core.psVault.address, info.user.address);
    expect(rewardBalanceAfter.sub(rewardBalanceBefore).toString())
    .is.not.eq("0", "should have earned iToken rewards");

    // ************* EXIT ***************
    await info.strategy.emergencyExit();
    await vaultForUser.exit();
    const userUnderlyingBalanceAfter = await Erc20Utils.balanceOf(info.underlying, info.user.address);
    expect(userUnderlyingBalanceAfter).is.eq(userUnderlyingBalance, "should have all underlying");

    const userEarnedTotalAfter = await info.core.bookkeeper.userEarned(info.user.address, info.vault.address, rt0);
    console.log('user total earned rt0', +utils.formatUnits(userEarnedTotal), +utils.formatUnits(userEarnedTotalAfter),
        +utils.formatUnits(userEarnedTotalAfter) - +utils.formatUnits(userEarnedTotal))
    expect(+utils.formatUnits(userEarnedTotalAfter))
    .is.greaterThan(+utils.formatUnits(userEarnedTotal));
  }

  public static async checkStrategyRewardsBalance(strategy: IStrategy, balances: string[]) {
    const tokens = await strategy.rewardTokens();
    for (let i = 0; i < tokens.length; i++) {
      expect((await Erc20Utils.balanceOf(tokens[i], strategy.address)).toString())
      .is.eq(balances[i], 'strategy has wrong reward balance for ' + i);
    }
  }

  public static async checkStrategyBalances(strategy: IStrategy, vault: SmartVault, deposit: BigNumber) {
    const invested = deposit;

    expect(await strategy.underlyingBalance()).at.eq("0", "all assets invested");
    expect(await strategy.investedUnderlyingBalance()).at.eq(invested.toString(), "assets in the pool");
    expect(await vault.underlyingBalanceInVault())
    .at.eq(deposit.sub(invested), "all assets in strategy");
  }

  public static async deposit(
      user: SignerWithAddress,
      vault: SmartVault,
      underlying: string,
      deposit: string
  ) {
    const dec = await Erc20Utils.decimals(underlying);
    const bal = await Erc20Utils.balanceOf(underlying, user.address);
    console.log('balance', utils.formatUnits(bal, dec), bal.toString());
    expect(+utils.formatUnits(bal, dec))
    .is.greaterThanOrEqual(+utils.formatUnits(deposit, dec), 'not enough balance')
    const vaultForUser = vault.connect(user);
    await Erc20Utils.approve(underlying, user, vault.address, deposit);
    console.log('deposit', BigNumber.from(deposit).toString())
    await vaultForUser.depositAndInvest(BigNumber.from(deposit));
  }

  public static async checkEmergencyExit(info: StrategyInfo) {
    const deposit = await Erc20Utils.balanceOf(info.underlying, info.user.address);

    await VaultUtils.deposit(info.user, info.vault, deposit);

    await StrategyTestUtils.checkStrategyBalances(info.strategy, info.vault, BigNumber.from(deposit));

    await info.strategy.emergencyExit();

    expect(await info.strategy.pausedInvesting()).is.true;
    await info.strategy.continueInvesting();
    expect(await info.strategy.pausedInvesting()).is.false;

    expect(await info.strategy.rewardPoolBalance())
    .is.eq("0", "assets in the pool");
  }

  public static async exit(
      vaultForUser: SmartVault,
      userAddress: string,
      deposit: string,
      underlying: string,
      userUnderlyingBalance: BigNumber
  ) {
    console.log('try withdraw')
    await vaultForUser.withdraw(BigNumber.from(deposit).div(2));
    const undDec = await Erc20Utils.decimals(underlying);
    const currentBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, userAddress), undDec);
    const expectedBal = +utils.formatUnits(userUnderlyingBalance.sub(BigNumber.from(deposit).div(2)), undDec);
    expect(currentBal)
    .is.approximately(expectedBal, expectedBal * 0.01, "should have a half of underlying");
    console.log('try exit')
    await vaultForUser.exit();
    expect(await Erc20Utils.balanceOf(underlying, userAddress))
    .is.eq(userUnderlyingBalance, "should have all underlying");
    console.log('user exited');
  }

  public static async saveBalances(rewardReceiver: string, strategy: IStrategy): Promise<BigNumber[]> {
    const tokens = await strategy.rewardTokens();
    const balances: BigNumber[] = [];
    for (let i = 0; i < tokens.length; i++) {
      balances.push(await Erc20Utils.balanceOf(tokens[i], rewardReceiver));
    }
    return balances;
  }

  public static checkBalances(balancesBefore: BigNumber[], balancesAfter: BigNumber[]) {
    balancesAfter.forEach((after, i) => {
      expect(after.sub(balancesBefore[i]).isZero())
      .is.eq(false, "should have earned rewards for " + i);
    })
  }

  public static async commonTests(info: StrategyInfo) {
    expect(await info.strategy.unsalvageableTokens(info.underlying)).is.true;
    expect(await info.strategy.unsalvageableTokens(MaticAddresses.ZERO_ADDRESS)).is.false;
    expect(await info.strategy.buyBackRatio()).is.eq("10000");
    expect(await info.strategy.platform()).is.not.eq(0);
    expect(await info.strategy.assets()).is.not.empty;
    expect(await info.strategy.poolTotalAmount()).is.not.eq('0');
    expect(await info.strategy.poolWeeklyRewardsAmount()).is.not.eq('0');
  }


  public static async getBlockTime(): Promise<number> {
    const block = await ethers.provider.getBlockNumber();
    console.log('block', block);
    return (await ethers.provider.getBlock(block))?.timestamp;
  }

}
