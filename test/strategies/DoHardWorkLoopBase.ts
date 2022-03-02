import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {IStrategy, SmartVault, StrategySplitter__factory} from "../../typechain";
import {ToolsContractsWrapper} from "../ToolsContractsWrapper";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {Misc} from "../../scripts/utils/tools/Misc";
import {VaultUtils} from "../VaultUtils";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";


export class DoHardWorkLoopBase {

  public readonly signer: SignerWithAddress;
  public readonly user: SignerWithAddress;
  public readonly core: CoreContractsWrapper;
  public readonly tools: ToolsContractsWrapper;
  public readonly underlying: string;
  public readonly vault: SmartVault;
  public readonly strategy: IStrategy;
  public readonly balanceTolerance: number;
  public readonly finalBalanceTolerance: number;
  private readonly vaultRt: string;
  vaultForUser: SmartVault;
  undDec = 0;
  userDeposited = BigNumber.from(0);
  signerDeposited = BigNumber.from(0);
  userWithdrew = BigNumber.from(0);
  userRTBal = BigNumber.from(0);
  vaultRTBal = BigNumber.from(0);
  psBal = BigNumber.from(0);
  psPPFS = BigNumber.from(0);

  loops = 0;
  loopStartTs = 0;
  startTs = 0;
  bbRatio = 0;
  isUserDeposited = true;
  stratEarnedTotal = BigNumber.from(0);
  stratEarned = BigNumber.from(0);
  vaultPPFS = BigNumber.from(0);
  priceCache = new Map<string, BigNumber>();
  totalToClaimInTetuN = 0;
  toClaimCheckTolerance = 0.3;

  constructor(
    signer: SignerWithAddress,
    user: SignerWithAddress,
    core: CoreContractsWrapper,
    tools: ToolsContractsWrapper,
    underlying: string,
    vault: SmartVault,
    strategy: IStrategy,
    balanceTolerance: number,
    finalBalanceTolerance: number,
  ) {
    this.signer = signer;
    this.user = user;
    this.core = core;
    this.tools = tools;
    this.underlying = underlying;
    this.vault = vault;
    this.strategy = strategy;
    this.balanceTolerance = balanceTolerance;
    this.finalBalanceTolerance = finalBalanceTolerance;

    this.vaultForUser = vault.connect(user);
    this.vaultRt = this.core.psVault.address;
  }

  public async start(deposit: BigNumber, loops: number, loopValue: number, advanceBlocks: boolean) {
    const start = Date.now();
    this.loops = loops;
    this.userDeposited = deposit;
    await this.init();
    await this.initialCheckVault();
    await this.enterToVault();
    await this.initialSnapshot();
    await this.loop(loops, loopValue, advanceBlocks);
    await this.postLoopCheck();
    Misc.printDuration('HardWork test finished', start);
  }

  protected async init() {
    this.undDec = await TokenUtils.decimals(this.underlying);
  }

  protected async initialCheckVault() {
    expect((await this.vault.rewardTokens())[0].toLowerCase()).eq(this.vaultRt.toLowerCase());
  }

  protected async initialSnapshot() {
    this.userRTBal = await TokenUtils.balanceOf(this.vaultRt, this.user.address);
    this.vaultRTBal = await TokenUtils.balanceOf(this.vaultRt, this.vault.address);
    this.psBal = await TokenUtils.balanceOf(this.vaultRt, this.core.psVault.address);
    this.psPPFS = await this.core.psVault.getPricePerFullShare();
    this.startTs = await Misc.getBlockTsFromChain();
    this.bbRatio = (await this.strategy.buyBackRatio()).toNumber();
  }

  // signer and user enter to the vault
  // we should have not zero balance if user exit the vault for properly check
  protected async enterToVault() {
    // initial deposit from signer
    await VaultUtils.deposit(this.signer, this.vault, this.userDeposited.div(2));
    this.signerDeposited = this.userDeposited.div(2);
    await VaultUtils.deposit(this.user, this.vault, this.userDeposited);
    await this.userCheckBalanceInVault();

    // remove excess tokens
    const excessBalUser = await TokenUtils.balanceOf(this.underlying, this.user.address);
    await TokenUtils.transfer(this.underlying, this.user, this.tools.utils.address, excessBalUser.toString());
    const excessBalSigner = await TokenUtils.balanceOf(this.underlying, this.signer.address);
    await TokenUtils.transfer(this.underlying, this.signer, this.tools.utils.address, excessBalSigner.toString());
  }

  protected async loopStartActions(i: number) {
    const start = Date.now();
    if (i > 1) {
      const den = (await this.core.controller.psDenominator()).toNumber();
      const newNum = +(den / i).toFixed()
      console.log('new ps ratio', newNum, den)
      await this.core.announcer.announceRatioChange(9, newNum, den);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
      await this.core.controller.setPSNumeratorDenominator(newNum, den);
    }
    Misc.printDuration('fLoopStartActionsDefault completed', start);
  }

  protected async loopStartSnapshot() {
    this.loopStartTs = await Misc.getBlockTsFromChain();
    this.vaultPPFS = await this.vault.getPricePerFullShare();
    this.stratEarnedTotal = await this.strategyEarned();
  }

  protected async loopEndCheck() {
    // ** check to claim
    if (this.totalToClaimInTetuN !== 0 && this.bbRatio !== 0) {
      const earnedN = +utils.formatUnits(this.stratEarned);
      const earnedNAdjusted = earnedN / (this.bbRatio / 10000);
      expect(earnedNAdjusted).is.greaterThanOrEqual(this.totalToClaimInTetuN * this.toClaimCheckTolerance); // very approximately
    }
  }

  protected async userCheckBalanceInVault() {
    // assume that at this point we deposited all expected amount except userWithdrew amount
    const userBalance = await this.vault.underlyingBalanceWithInvestmentForHolder(this.user.address);
    // avoid rounding errors
    const userBalanceN = +utils.formatUnits(userBalance.add(1), this.undDec);
    const userBalanceExpectedN = +utils.formatUnits(this.userDeposited.sub(this.userWithdrew), this.undDec);

    console.log('User balance +-:', DoHardWorkLoopBase.toPercent(userBalanceN, userBalanceExpectedN));
    expect(userBalanceN).is.greaterThanOrEqual(userBalanceExpectedN - (userBalanceExpectedN * this.balanceTolerance),
      'User has wrong balance inside the vault.\n' +
      'If you expect not zero balance it means the vault has a nature of PPFS decreasing.\n' +
      'It is not always wrong but you should triple check behavior and reasonable tolerance value.\n' +
      'If you expect zero balance and it has something inside IT IS NOT GOOD!\n');
  }

  protected async userCheckBalance(expectedBalance: BigNumber) {
    const userUndBal = await TokenUtils.balanceOf(this.underlying, this.user.address);
    const userUndBalN = +utils.formatUnits(userUndBal, this.undDec);
    const userBalanceExpectedN = +utils.formatUnits(expectedBalance, this.undDec);
    console.log('User balance +-:', DoHardWorkLoopBase.toPercent(userUndBalN, userBalanceExpectedN));
    expect(userUndBalN).is.greaterThanOrEqual(userBalanceExpectedN - (userBalanceExpectedN * this.balanceTolerance),
      'User has not enough balance');
  }

  protected async withdraw(exit: boolean, amount: BigNumber) {
    // no actions if zero balance
    if ((await TokenUtils.balanceOf(this.vault.address, this.user.address)).isZero()) {
      return;
    }
    console.log('PPFS before withdraw', (await this.vault.getPricePerFullShare()).toString());
    await this.userCheckBalanceInVault();
    if (exit) {
      console.log('exit');
      await this.vaultForUser.exit();
      await this.userCheckBalance(this.userDeposited);
      this.userWithdrew = this.userDeposited;
    } else {
      const userUndBal = await TokenUtils.balanceOf(this.underlying, this.user.address);
      console.log('withdraw', amount.toString());
      await this.vaultForUser.withdraw(amount);
      await this.userCheckBalance(this.userWithdrew.add(amount));
      const userUndBalAfter = await TokenUtils.balanceOf(this.underlying, this.user.address);
      this.userWithdrew = this.userWithdrew.add(userUndBalAfter.sub(userUndBal));
    }
    console.log('userWithdrew', this.userWithdrew.toString());
    console.log('PPFS after withdraw', (await this.vault.getPricePerFullShare()).toString());
  }

  // don't use for initial deposit
  protected async deposit(amount: BigNumber, invest: boolean) {
    console.log('PPFS before deposit', (await this.vault.getPricePerFullShare()).toString());
    await VaultUtils.deposit(this.user, this.vault, amount, invest);
    this.userWithdrew = this.userWithdrew.sub(amount);
    console.log('userWithdrew', this.userWithdrew.toString());
    await this.userCheckBalanceInVault();
    console.log('PPFS after deposit', (await this.vault.getPricePerFullShare()).toString());
  }

  protected async loopEndActions(i: number) {
    const start = Date.now();
    // we need to enter and exit from the vault between loops for properly check all mechanic
    if (this.isUserDeposited && i % 2 === 0) {
      this.isUserDeposited = false;
      if (i % 4 === 0) {
        await this.withdraw(true, BigNumber.from(0));
      } else {
        const userXTokenBal = await TokenUtils.balanceOf(this.vault.address, this.user.address);
        const toWithdraw = BigNumber.from(userXTokenBal).mul(95).div(100);
        await this.withdraw(false, toWithdraw);
      }

    } else if (!this.isUserDeposited && i % 2 !== 0) {
      this.isUserDeposited = true;
      const uBal = await TokenUtils.balanceOf(this.underlying, this.user.address);
      await this.deposit(BigNumber.from(uBal).div(3), false);
      await this.deposit(BigNumber.from(uBal).div(3), true);
    }
    Misc.printDuration('fLoopEndActions completed', start);
  }

  protected async loopPrintROIAndSaveEarned(i: number) {
    const start = Date.now();
    const stratEarnedTotal = await this.strategyEarned();
    const stratEarnedTotalN = +utils.formatUnits(stratEarnedTotal);
    this.stratEarned = stratEarnedTotal.sub(this.stratEarnedTotal);
    const stratEarnedN = +utils.formatUnits(this.stratEarned);
    const loopEndTs = await Misc.getBlockTsFromChain();
    const loopTime = loopEndTs - this.loopStartTs;

    const targetTokenPrice = await this.getPrice(this.core.rewardToken.address);
    const targetTokenPriceN = +utils.formatUnits(targetTokenPrice);
    const underlyingPrice = await this.getPrice(this.underlying);
    const underlyingPriceN = +utils.formatUnits(underlyingPrice);

    const tvl = await this.vault.underlyingBalanceWithInvestment();
    const tvlN = +utils.formatUnits(tvl, this.undDec);

    const tvlUsdc = tvlN * underlyingPriceN;
    const earnedUsdc = stratEarnedTotalN * targetTokenPriceN;
    const earnedUsdcThisCycle = stratEarnedN * targetTokenPriceN;

    const roi = ((earnedUsdc / tvlUsdc) / (loopEndTs - this.startTs)) * 100 * Misc.SECONDS_OF_YEAR;
    const roiThisCycle = ((earnedUsdcThisCycle / tvlUsdc) / loopTime) * 100 * Misc.SECONDS_OF_YEAR;

    console.log('++++++++++++++++ ROI ' + i + ' ++++++++++++++++++++++++++')
    console.log('Loop time', (loopTime / 60 / 60).toFixed(1), 'hours');
    console.log('TETU earned total', stratEarnedTotalN);
    console.log('TETU earned for this loop', stratEarnedN);
    console.log('ROI total', roi);
    console.log('ROI current', roiThisCycle);
    console.log('+++++++++++++++++++++++++++++++++++++++++++++++')
    Misc.printDuration('fLoopPrintROIAndSaveEarned completed', start);
  }

  protected async afterBlockAdvance() {
    const start = Date.now();
    // ** calculate to claim
    this.totalToClaimInTetuN = 0;
    const toClaim = await this.strategy.readyToClaim();
    if (toClaim.length !== 0) {
      const platform = await this.strategy.platform();
      const tetuPriceN = +utils.formatUnits(await this.getPrice(this.core.rewardToken.address));
      let rts;
      if (platform === 24) {
        rts = await StrategySplitter__factory.connect(this.strategy.address, this.signer).strategyRewardTokens();
      } else {
        rts = await this.strategy.rewardTokens();
      }
      for (let i = 0; i < rts.length; i++) {
        const rt = rts[i];
        const rtDec = await TokenUtils.decimals(rt);
        const rtPriceN = +utils.formatUnits(await this.getPrice(rt));
        const toClaimInTetuN = +utils.formatUnits(toClaim[i], rtDec) * rtPriceN / tetuPriceN;
        console.log('toClaim', i, toClaimInTetuN);
        this.totalToClaimInTetuN += toClaimInTetuN;
      }
    }
    Misc.printDuration('fAfterBlocAdvance completed', start);
  }

  protected async loop(loops: number, loopValue: number, advanceBlocks: boolean) {
    for (let i = 0; i < loops; i++) {
      const start = Date.now();
      await this.loopStartActions(i);
      await this.loopStartSnapshot();

      // *********** DO HARD WORK **************
      if (advanceBlocks) {
        await TimeUtils.advanceNBlocks(loopValue);
      } else {
        await TimeUtils.advanceBlocksOnTs(loopValue);
      }
      await this.afterBlockAdvance();
      await VaultUtils.doHardWorkAndCheck(this.vault);
      await this.loopPrintROIAndSaveEarned(i);
      await this.loopEndCheck();
      await this.loopEndActions(i);
      Misc.printDuration(i + ' Loop ended', start);
    }
  }

  protected async postLoopCheck() {
    // wait enough time for get rewards for liquidation
    // we need to have strategy without rewards tokens in the end
    await TimeUtils.advanceNBlocks(3000);
    await this.withdraw(true, BigNumber.from(0));
    // exit for signer
    await this.vault.connect(this.signer).exit();
    await this.strategy.withdrawAllToVault();

    expect(await this.strategy.investedUnderlyingBalance()).is.eq(0);

    // need to call hard work for sell a little excess rewards
    await this.strategy.doHardWork();


    // strategy should not contain any tokens in the end
    const rts = await this.strategy.rewardTokens();
    for (const rt of rts) {
      if (rt.toLowerCase() === this.underlying.toLowerCase()) {
        continue;
      }
      const rtBal = await TokenUtils.balanceOf(rt, this.strategy.address);
      console.log('rt balance in strategy', rt, rtBal);
      expect(rtBal).is.eq(0, 'Strategy contains not liquidated rewards');
    }

    // check vault balance
    const vaultBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.vault.address);
    expect(vaultBalanceAfter.sub(this.vaultRTBal)).is.not.eq("0", "vault reward should increase");

    if (this.bbRatio !== 0) {
      // check ps balance
      const psBalanceAfter = await TokenUtils.balanceOf(this.core.rewardToken.address, this.core.psVault.address);
      expect(psBalanceAfter.sub(this.psBal)).is.not.eq("0", "ps balance should increase");

      // check ps PPFS
      const psSharePriceAfter = await this.core.psVault.getPricePerFullShare();
      expect(psSharePriceAfter.sub(this.psPPFS)).is.not.eq("0", "ps share price should increase");
    }

    // check reward for user
    const rewardBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.user.address);
    expect(rewardBalanceAfter.sub(this.userRTBal).toString())
      .is.not.eq("0", "should have earned xTETU rewards");

    const userDepositedN = +utils.formatUnits(this.userDeposited, this.undDec);
    // some pools have auto compounding so user balance can increase
    const userUnderlyingBalanceAfter = await TokenUtils.balanceOf(this.underlying, this.user.address);
    const userUnderlyingBalanceAfterN = +utils.formatUnits(userUnderlyingBalanceAfter, this.undDec);
    const userBalanceExpected = userDepositedN - (userDepositedN * this.finalBalanceTolerance);
    console.log('User final balance +-: ', DoHardWorkLoopBase.toPercent(userUnderlyingBalanceAfterN, userDepositedN));
    expect(userUnderlyingBalanceAfterN).is.greaterThanOrEqual(userBalanceExpected, "user should have more underlying");

    const signerDepositedN = +utils.formatUnits(this.signerDeposited, this.undDec);
    const signerUnderlyingBalanceAfter = await TokenUtils.balanceOf(this.underlying, this.signer.address);
    const signerUnderlyingBalanceAfterN = +utils.formatUnits(signerUnderlyingBalanceAfter, this.undDec);
    const signerBalanceExpected = signerDepositedN - (signerDepositedN * this.finalBalanceTolerance);
    console.log('Signer final balance +-: ', DoHardWorkLoopBase.toPercent(signerUnderlyingBalanceAfterN, signerDepositedN));
    expect(signerUnderlyingBalanceAfterN).is.greaterThanOrEqual(signerBalanceExpected, "signer should have more underlying");
  }

  private async getPrice(token: string): Promise<BigNumber> {
    console.log('getPrice', token)
    token = token.toLowerCase();
    if (this.priceCache.has(token)) {
      return this.priceCache.get(token) as BigNumber;
    }
    let price;
    if (token === this.core.rewardToken.address.toLowerCase()) {
      price = await this.tools.calculator.getPriceWithDefaultOutput(token);
    } else if (token === this.core.psVault.address.toLowerCase()) {
      // assume that PS price didn't change dramatically
      price = await this.tools.calculator.getPriceWithDefaultOutput(this.core.rewardToken.address);
    } else {
      price = await PriceCalculatorUtils.getPriceCached(token, this.tools.calculator);
    }
    this.priceCache.set(token, price);
    console.log('price is', price.toString());
    return price;
  }

  private async strategyEarned() {
    let result = BigNumber.from(0);
    const platform = await this.strategy.platform();
    if (platform === 24) {
      const splitter = StrategySplitter__factory.connect(this.strategy.address, this.signer);
      const strategies = await splitter.allStrategies();
      for (const s of strategies) {
        result = result.add(await this.core.bookkeeper.targetTokenEarned(s));
      }
    } else {
      result = await this.core.bookkeeper.targetTokenEarned(this.strategy.address);
    }
    return result;
  }

  private static toPercent(actual: number, expected: number): string {
    const percent = (actual / expected * 100) - 100;
    return percent.toFixed(6) + '%';
  }
}
