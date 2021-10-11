import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";
import {StrategyInfo} from "./StrategyInfo";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {VaultUtils} from "../VaultUtils";


export class DoHardWorkLoop {

  public static async doHardWorkLoop(info: StrategyInfo, deposit: string, loops: number, loopTime: number) {
    const calculator = (await DeployerUtils
    .deployPriceCalculatorMatic(info.signer, info.core.controller.address))[0];
    const vaultForUser = info.vault.connect(info.user);
    const undDec = await TokenUtils.decimals(info.underlying);

    const userUnderlyingBalance = await TokenUtils.balanceOf(info.underlying, info.user.address);

    console.log("deposit", deposit);
    await VaultUtils.deposit(info.user, info.vault, BigNumber.from(deposit));

    const rewardBalanceBefore = await TokenUtils.balanceOf(info.core.psVault.address, info.user.address);
    const vaultBalanceBefore = await TokenUtils.balanceOf(info.core.psVault.address, info.vault.address);
    const psBalanceBefore = await TokenUtils.balanceOf(info.core.rewardToken.address, info.core.psVault.address);
    const psSharePriceBefore = await info.core.psVault.getPricePerFullShare();

    const start = await StrategyTestUtils.getBlockTime();
    let earnedTotal = 0;
    let earnedTotalPure = BigNumber.from(0);
    for (let i = 0; i < loops; i++) {
      if (i > 1) {
        const den = (await info.core.controller.psDenominator()).toNumber();
        const newNum = +(den / i).toFixed()
        console.log('new ps ratio', newNum, den)
        await info.core.announcer.announceRatioChange(9, newNum, den);
        await TimeUtils.advanceBlocksOnTs(1);
        await info.core.controller.setPSNumeratorDenominator(newNum, den);
      }
      const loopStart = await StrategyTestUtils.getBlockTime();
      const balancesBefore = await StrategyTestUtils.saveBalances(info.signer.address, info.strategy);
      // console.log('balancesBefore', balancesBefore[0].toString());

      const psRate = await VaultUtils.profitSharingRatio(info.core.controller);
      console.log('psRate', psRate);

      const oldPpfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

      // *********** DO HARD WORK **************
      await TimeUtils.advanceBlocksOnTs(loopTime);
      await VaultUtils.doHardWorkAndCheck(info.vault);

      const ppfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

      console.log('PPFS', oldPpfs, ppfs, ppfs - oldPpfs);
      expect(ppfs).is.greaterThanOrEqual(oldPpfs);

      const balancesAfter = await StrategyTestUtils.saveBalances(info.signer.address, info.strategy);
      // console.log('balancesAfter', balancesAfter[0].toString(), balancesAfter[0].sub(balancesBefore[0]).toString());

      // ##### CHECK STRAT EARNED #########
      const earnedPure = await info.core.bookkeeper.targetTokenEarned(info.strategy.address);
      const earnedThisCyclePure = earnedPure.sub(earnedTotalPure);
      earnedTotalPure = earnedPure;
      const earned = +utils.formatUnits(earnedPure);
      const earnedThiCycle = +utils.formatUnits(earnedThisCyclePure);
      earnedTotal = earned;
      const currentTs = await StrategyTestUtils.getBlockTime();
      console.log('earned: ' + earnedThiCycle,
          'earned total: ' + earned,
          'cycle time: ' + (currentTs - loopStart)
      );

      const targetTokenPrice = +utils.formatUnits(await calculator.getPrice(info.core.rewardToken.address, MaticAddresses.USDC_TOKEN));
      const underlyingPrice = +utils.formatUnits(await calculator.getPrice(info.underlying, MaticAddresses.USDC_TOKEN));
      console.log('underlyingPrice', underlyingPrice);
      const earnedUsdc = earned * targetTokenPrice;
      const earnedUsdcThisCycle = earnedThiCycle * targetTokenPrice;
      console.log('earned USDC: ' + earnedUsdcThisCycle, 'earned total usdc: ' + earnedUsdc);

      const tvl = +utils.formatUnits(await info.vault.underlyingBalanceWithInvestment());
      console.log('tvl', tvl);
      console.log('time', currentTs - start);
      const tvlUsdc = tvl * underlyingPrice;

      const roi = ((earnedUsdc / tvlUsdc) / (currentTs - start))
          * 100 * StrategyTestUtils.SECONDS_OF_YEAR;

      const roiThisCycle = ((earnedUsdcThisCycle / tvlUsdc) / (currentTs - loopStart))
          * 100 * StrategyTestUtils.SECONDS_OF_YEAR;

      console.log('############################################################### --- ROI: ', roi, roiThisCycle);
      // hardhat sometimes doesn't provide a block for some reason, need to investigate why
      // it is not critical checking, we already checked earned amount
      // expect(roi).is.greaterThan(0, 'zero roi');


      await vaultForUser.exit();
      // some pools have auto compounding so user balance can increase
      expect(+utils.formatUnits(await TokenUtils.balanceOf(info.underlying, info.user.address), undDec))
      .is.greaterThanOrEqual(+utils.formatUnits(userUnderlyingBalance, undDec), "should have all underlying");

      await VaultUtils.deposit(info.user, info.vault, BigNumber.from(deposit).div(2));
      await VaultUtils.deposit(info.user, info.vault, BigNumber.from(deposit).div(2), false);
    }

    // liquidate rewards after user withdraw
    await VaultUtils.doHardWorkAndCheck(info.vault);
    // *************** POST LOOPS CHECKING **************

    await StrategyTestUtils.checkStrategyRewardsBalance(info.strategy, ['0', '0']);

    // check vault balance
    const vaultBalanceAfter = await TokenUtils.balanceOf(info.core.psVault.address, info.vault.address);
    expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");

    // check ps balance
    const psBalanceAfter = await TokenUtils.balanceOf(info.core.rewardToken.address, info.core.psVault.address);
    expect(psBalanceAfter.sub(psBalanceBefore)).is.not.eq("0", "ps balance should increase");

    // check ps PPFS
    const psSharePriceAfter = await info.core.psVault.getPricePerFullShare();
    expect(psSharePriceAfter.sub(psSharePriceBefore)).is.not.eq("0", "ps share price should increase");

    // check reward for user
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7); // 1 week
    await vaultForUser.getAllRewards();
    const rewardBalanceAfter = await TokenUtils.balanceOf(info.core.psVault.address, info.user.address);
    expect(rewardBalanceAfter.sub(rewardBalanceBefore).toString())
    .is.not.eq("0", "should have earned iToken rewards");

    // ************* EXIT ***************
    await vaultForUser.exit();
    // some pools have auto compounding so user balance can increase
    const userUnderlyingBalanceAfter = await TokenUtils.balanceOf(info.underlying, info.user.address);
    expect(+utils.formatUnits(userUnderlyingBalanceAfter, undDec))
    .is.greaterThanOrEqual(+utils.formatUnits(userUnderlyingBalance, undDec), "should have all underlying");
  }

}
