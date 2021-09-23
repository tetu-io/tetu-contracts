import {ethers} from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {StrategyInfo} from "./StrategyInfo";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../MaticAddresses";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {UniswapUtils} from "../UniswapUtils";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {StrategyIronFold} from "../../typechain";
import {VaultUtils} from "../VaultUtils";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startIronFoldStrategyTest(
    strategyName: string,
    factory: string,
    underlying: string,
    tokenName: string,
    rewardTokens: string[],
    rToken: string,
    borrowTargetFactorNumerator: string,
    collateralFactorNumerator: string
) {

  describe(strategyName + " " + tokenName + "Test", async function () {
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;

    before(async function () {
      snapshotBefore = await TimeUtils.snapshot();
      const signer = (await ethers.getSigners())[0];
      const user = (await ethers.getSigners())[1];

      const core = await DeployerUtils.deployAllCoreContracts(signer, 60 * 60 * 24 * 28, 1);
      const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

      for (let rt of rewardTokens) {
        await core.feeRewardForwarder.setConversionPath(
            [rt, MaticAddresses.USDC_TOKEN, core.rewardToken.address],
            [MaticAddresses.getRouterByFactory(factory), MaticAddresses.QUICK_ROUTER]
        );
        await core.feeRewardForwarder.setConversionPath(
            [rt, MaticAddresses.USDC_TOKEN],
            [MaticAddresses.getRouterByFactory(factory)]
        );

        if (MaticAddresses.USDC_TOKEN === underlying.toLowerCase()) {
          await core.feeRewardForwarder.setConversionPath(
              [rt, MaticAddresses.USDC_TOKEN],
              [MaticAddresses.getRouterByFactory(factory)]
          );
        } else {
          await core.feeRewardForwarder.setConversionPath(
              [rt, MaticAddresses.USDC_TOKEN, underlying],
              [MaticAddresses.getRouterByFactory(factory), MaticAddresses.getRouterByFactory(factory)]
          );
        }

      }
      if (MaticAddresses.USDC_TOKEN !== underlying.toLowerCase()) {
        await core.feeRewardForwarder.setConversionPath(
            [underlying, MaticAddresses.USDC_TOKEN, core.rewardToken.address],
            [MaticAddresses.QUICK_ROUTER, MaticAddresses.QUICK_ROUTER]
        );
        await core.feeRewardForwarder.setConversionPath(
            [underlying, MaticAddresses.USDC_TOKEN],
            [MaticAddresses.QUICK_ROUTER]
        );
      }

      const data = await StrategyTestUtils.deploy(
          signer,
          core,
          tokenName,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              strategyName,
              core.controller.address,
              vaultAddress,
              underlying,
              rToken,
              borrowTargetFactorNumerator,
              collateralFactorNumerator
          ) as Promise<StrategyIronFold>,
          underlying
      );

      const vault = data[0];
      const strategy = data[1];
      const lpForTargetToken = data[2];

      await core.vaultController.changePpfsDecreasePermissions([vault.address], true);

      strategyInfo = new StrategyInfo(
          underlying,
          signer,
          user,
          core,
          vault,
          strategy,
          lpForTargetToken,
          calculator
      );

      const largest = (await calculator.getLargestPool(underlying, []));
      const tokenOpposite = largest[0];
      const tokenOppositeFactory = await calculator.swapFactories(largest[1]);
      console.log('largest', largest);

      //************** add funds for investing ************
      const baseAmount = 100_000;
      await UniswapUtils.buyAllBigTokens(user);
      const name = await TokenUtils.tokenSymbol(tokenOpposite);
      const dec = await TokenUtils.decimals(tokenOpposite);
      const price = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(tokenOpposite)));
      console.log('tokenOpposite Price', price, name);
      const amountForSell = baseAmount / price;
      console.log('amountForSell', amountForSell);

      await UniswapUtils.buyToken(user, MaticAddresses.getRouterByFactory(tokenOppositeFactory),
          underlying, utils.parseUnits(amountForSell.toString(), dec), tokenOpposite);
      console.log('############## Preparations completed ##################');
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


    it("do hard work with liq path", async () => {
      await StrategyTestUtils.doHardWorkWithLiqPath(strategyInfo,
          (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
          null
      );
    });
    it("emergency exit", async () => {
      const info = strategyInfo;
      const deposit = await TokenUtils.balanceOf(info.underlying, info.user.address);

      const undDec = await TokenUtils.decimals(info.underlying);
      const oldPpfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

      await VaultUtils.deposit(info.user, info.vault, deposit);

      const invested = deposit;
      const strategy = info.strategy;
      const vault = info.vault;
      expect(await strategy.underlyingBalance()).at.eq("0", "all assets invested");
      const stratInvested = await strategy.investedUnderlyingBalance();
      // loans return a bit less balance for deposited assets
      expect(+utils.formatUnits(stratInvested))
      .is.approximately(+utils.formatUnits(invested), +utils.formatUnits(stratInvested) * 0.001,
          "assets in the pool should be more or equal than invested");
      expect(await vault.underlyingBalanceInVault())
      .at.eq(deposit.sub(invested), "all assets in strategy");


      await info.strategy.emergencyExit();

      await info.vault.connect(info.user).exit();

      const ppfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

      console.log('ppfs', oldPpfs, ppfs, oldPpfs - ppfs);

      expect(await strategy.underlyingBalance()).at.eq("0", "all withdrew");
      expect(+utils.formatUnits(await strategy.investedUnderlyingBalance())).is.eq(0, "0 strat balance");
      expect(await vault.underlyingBalanceInVault()).at.eq(0, "0 vault bal");

      expect(await info.strategy.pausedInvesting()).is.true;
      await info.strategy.continueInvesting();
      expect(await info.strategy.pausedInvesting()).is.false;
    });
    it("common test should be ok", async () => {
      await StrategyTestUtils.commonTests(strategyInfo);
    });
    it("doHardWork loop", async function () {
      const deposit = 100_000;
      const undPrice = +utils.formatUnits(await strategyInfo.calculator.getPriceWithDefaultOutput(strategyInfo.underlying));
      const undDec = await TokenUtils.decimals(strategyInfo.underlying);
      const depositBN = utils.parseUnits((deposit / undPrice).toFixed(undDec), undDec);
      const bal = await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address);
      // remove excess balance
      await TokenUtils.transfer(strategyInfo.underlying, strategyInfo.user, strategyInfo.calculator.address, bal.sub(depositBN).toString());
      await doHardWorkLoopFolding(
          strategyInfo,
          depositBN.div(2).toString(),
          10,
          3000
      );
    });

  });
}

export {startIronFoldStrategyTest};


async function doHardWorkLoopFolding(info: StrategyInfo, deposit: string, loops: number, loopBlocks: number) {
  const foldContract = await DeployerUtils.connectInterface(info.signer, 'StrategyIronFold', info.strategy.address) as StrategyIronFold;
  const rr = await foldContract.rewardsRateNormalised();
  console.log('rr', rr.toString());
  const calculator = (await DeployerUtils
  .deployPriceCalculatorMatic(info.signer, info.core.controller.address))[0];
  const vaultForUser = info.vault.connect(info.user);
  const undDec = await TokenUtils.decimals(info.underlying);

  await TokenUtils.transfer(info.underlying, info.user, info.signer.address, BigNumber.from(deposit).div(2).toString());
  const userUnderlyingBalance = await TokenUtils.balanceOf(info.underlying, info.user.address);

  const signerUnderlyingBalance = await TokenUtils.balanceOf(info.underlying, info.signer.address);

  console.log("deposit", deposit);
  await VaultUtils.deposit(info.user, info.vault, BigNumber.from(deposit));

  const signerDeposit = await TokenUtils.balanceOf(info.underlying, info.signer.address);
  await VaultUtils.deposit(info.signer, info.vault, signerDeposit);

  const rewardBalanceBefore = await TokenUtils.balanceOf(info.core.psVault.address, info.user.address);
  const vaultBalanceBefore = await TokenUtils.balanceOf(info.core.psVault.address, info.vault.address);
  const psBalanceBefore = await TokenUtils.balanceOf(info.core.rewardToken.address, info.core.psVault.address);
  const psSharePriceBefore = await info.core.psVault.getPricePerFullShare();

  const start = await StrategyTestUtils.getBlockTime();
  let deposited = true;
  let earnedTotal = 0;
  let earnedTotalPure = BigNumber.from(0);
  for (let i = 0; i < loops; i++) {
    let folding = await foldContract.fold();
    // switch off folding on the 1/3 of cycles
    if (i === Math.floor(loops / 3) && folding) {
      await foldContract.stopFolding();
      folding = await foldContract.fold();
      expect(folding).is.false;
    }
    // switch on folding on the 2/3 of cycles
    if (i === Math.floor(loops / 3) * 2 && !folding) {
      await foldContract.startFolding();
      folding = await foldContract.fold();
      expect(folding).is.true;
    }
    console.log('------ FOLDING ENABLED', i, folding, await foldContract.isFoldingProfitable());
    if (i > 1) {
      const den = (await info.core.controller.psDenominator()).toNumber();
      const newNum = +(den / i).toFixed()
      console.log('new ps ratio', newNum, den)
      await info.core.announcer.announceRatioChange(9, newNum, den);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
      await info.core.controller.setPSNumeratorDenominator(newNum, den);
    }
    const loopStart = await StrategyTestUtils.getBlockTime();
    const balancesBefore = await StrategyTestUtils.saveBalances(info.signer.address, info.strategy);
    // console.log('balancesBefore', balancesBefore[0].toString());

    const psRate = await VaultUtils.profitSharingRatio(info.core.controller);
    console.log('psRate', psRate);

    const oldPpfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

    // *********** DO HARD WORK **************
    await TimeUtils.advanceNBlocks(loopBlocks);
    await info.vault.doHardWork();

    const ppfs = +utils.formatUnits(await info.vault.getPricePerFullShare(), undDec);

    console.log('PPFS', oldPpfs, ppfs, ppfs - oldPpfs);
    expect(ppfs).is.greaterThanOrEqual(oldPpfs * 0.999);

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

    const tvl = +utils.formatUnits(await info.vault.underlyingBalanceWithInvestment(), undDec);
    console.log('time', currentTs - start);
    const tvlUsdc = tvl * underlyingPrice;
    console.log('tvl', tvl, tvlUsdc);

    const roi = ((earnedUsdc / tvlUsdc) / (currentTs - start))
        * 100 * StrategyTestUtils.SECONDS_OF_YEAR;

    const roiThisCycle = ((earnedUsdcThisCycle / tvlUsdc) / (currentTs - loopStart))
        * 100 * StrategyTestUtils.SECONDS_OF_YEAR;

    console.log('############################################################### --- ROI: ', roi, roiThisCycle);
    // hardhat sometimes doesn't provide a block for some reason, need to investigate why
    // it is not critical checking, we already checked earned amount
    // expect(roi).is.greaterThan(0, 'zero roi');

    if (deposited && i % 3 === 0) {
      deposited = false;
      const vBal = await vaultForUser.underlyingBalanceWithInvestment();
      const bal = await TokenUtils.balanceOf(vaultForUser.address, info.user.address);
      //* INVESTOR CAN WITHDRAW A VERY LITTLE AMOUNT LOWER OR HIGHER
      // depends on ppfs fluctuation
      if (i % 2 === 0) {
        console.log('user exit', bal.toString(), vBal.toString());
        console.log('ppfs', utils.formatUnits(await info.vault.getPricePerFullShare(), undDec));
        await vaultForUser.exit();
        // some pools have auto compounding so user balance can increase
        expect(+utils.formatUnits(await TokenUtils.balanceOf(info.underlying, info.user.address), undDec))
        .is.greaterThanOrEqual(+utils.formatUnits(userUnderlyingBalance, undDec) * 0.999, "should have all underlying");
      } else {
        console.log('user withdraw', bal.toString(), vBal.toString());
        await vaultForUser.withdraw(BigNumber.from(bal).mul(90).div(100));
        // some pools have auto compounding so user balance can increase
        expect(+utils.formatUnits(await TokenUtils.balanceOf(info.underlying, info.user.address), undDec))
        .is.greaterThanOrEqual(+utils.formatUnits(userUnderlyingBalance.mul(90).div(100), undDec) * 0.999, "should have all underlying");
      }


    } else if (!deposited && i % 2 === 0) {
      deposited = true;
      const bal = await TokenUtils.balanceOf(info.underlying, info.user.address);
      console.log('user deposit', bal.toString());
      await VaultUtils.deposit(info.user, info.vault, BigNumber.from(bal).div(3));
      await VaultUtils.deposit(info.user, info.vault, BigNumber.from(bal).div(3), false);
    }

  }

  // *************** POST LOOPS CHECKING **************
  // with multiple deposits we will have unsold rewards after exit
  // await StrategyTestUtils.checkStrategyRewardsBalance(info.strategy, ['0', '0']);

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
  const bal = await TokenUtils.balanceOf(vaultForUser.address, info.user.address);
  if (!bal.isZero()) {
    await vaultForUser.exit();
  }
  await info.vault.exit();
  // some pools have auto compounding so user balance can increase
  const userUnderlyingBalanceAfter = await TokenUtils.balanceOf(info.underlying, info.user.address);
  expect(+utils.formatUnits(userUnderlyingBalanceAfter, undDec))
  .is.greaterThanOrEqual(+utils.formatUnits(userUnderlyingBalance, undDec) * 0.999, "user should have all underlying");

  const signerUnderlyingBalanceAfter = await TokenUtils.balanceOf(info.underlying, info.user.address);
  expect(+utils.formatUnits(signerUnderlyingBalanceAfter, undDec))
  .is.greaterThanOrEqual(+utils.formatUnits(signerUnderlyingBalance, undDec) * 0.999, "signer should have all underlying");
}
