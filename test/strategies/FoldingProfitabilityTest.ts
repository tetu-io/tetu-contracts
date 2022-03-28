import {BigNumber, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {Bookkeeper, FoldingBase, IERC20, PriceCalculator, SmartVault} from "../../typechain";
import {SpecificStrategyTest} from "./SpecificStrategyTest";
import {DeployInfo} from "./DeployInfo";
import {TokenUtils} from "../TokenUtils";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {TimeUtils} from "../TimeUtils";
import {VaultUtils} from "../VaultUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class FoldingProfitabilityTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Folding profitability test", async function () {
      // * INIT VARIABLES
      const investingPeriod = 60 * 60;
      const bookkeeper = deployInfo?.core?.bookkeeper as Bookkeeper;
      const calculator = deployInfo?.tools?.calculator as PriceCalculator;
      const tetu = deployInfo?.core?.rewardToken as IERC20;
      const strategy = (deployInfo?.strategy as FoldingBase);
      const underlying = deployInfo?.underlying as string;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;

      const underlyingUSDPrice = +utils.formatUnits(await PriceCalculatorUtils.getPriceCached(underlying, calculator));
      let tetuUSDCPrice = +utils.formatUnits(await PriceCalculatorUtils.getPriceCached(tetu.address, calculator));
      // in case of new network
      if (tetuUSDCPrice === 0) {
        tetuUSDCPrice = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(tetu.address));
      }
      console.log("Underlying USD price: ", underlyingUSDPrice);
      console.log("TETU USD price:  ", tetuUSDCPrice);

      const deposit = await TokenUtils.balanceOf(underlying, user.address);
      console.log("deposit", deposit.toString());
      const und = await vault.underlying();
      const undDec = await TokenUtils.decimals(und);
      const isFoldingProfitable = await strategy.isFoldingProfitable();
      if(!isFoldingProfitable) {
        // TODO we can't test it in this way after last changes
        return;
      }

      console.log("Is Folding profitable: ", isFoldingProfitable);
      const snapshotFolding = await TimeUtils.snapshot();

      const {
        underlyingProfit: underlyingProfitLending,
        tetuProfit: tetuProfitLending
      } = await FoldingProfitabilityTest.hardWork(
        user,
        vault,
        strategy,
        deposit,
        undDec,
        investingPeriod,
        bookkeeper,
        2,
      );

      await TimeUtils.rollback(snapshotFolding);

      const {
        underlyingProfit: underlyingProfitFolding,
        tetuProfit: tetuProfitFolding
      } = await FoldingProfitabilityTest.hardWork(
        user,
        vault,
        strategy,
        deposit,
        undDec,
        investingPeriod,
        bookkeeper,
        1,
      );

      const lendingUnderlyingProfitUSD = underlyingProfitLending * underlyingUSDPrice;
      const foldingUnderlyingProfitUSD = underlyingProfitFolding * underlyingUSDPrice;

      const lendingTetuProfitUSD = tetuProfitLending * tetuUSDCPrice;
      const foldingTetuProfitUSD = tetuProfitFolding * tetuUSDCPrice;

      const totalLendingProfitUSD = lendingUnderlyingProfitUSD + lendingTetuProfitUSD;
      const totalFoldingProfitUSD = foldingTetuProfitUSD + foldingUnderlyingProfitUSD;

      const difference = totalFoldingProfitUSD / totalLendingProfitUSD * 100 - 100;
      const isFoldingProfitableReal = difference > -0.1;

      console.log("===========================");
      console.log("=========Lending===========");
      console.log("Underlying: ", underlyingProfitLending, "Tetu: ", tetuProfitLending);
      console.log("=========Folding===========");
      console.log("Underlying: ", underlyingProfitFolding, "Tetu: ", tetuProfitFolding);
      console.log("===========================");
      console.log("Total lending profit: ", totalLendingProfitUSD);
      console.log("Total folding profit: ", totalFoldingProfitUSD);
      console.log("Difference: ", difference, "%");
      expect(isFoldingProfitable).is.eq(isFoldingProfitableReal, "Folding prediction is not fit real result");
    });
  }

  public static async hardWork(
    user: SignerWithAddress,
    vault: SmartVault,
    strategy: FoldingBase,
    deposit: BigNumber,
    undDec: number,
    investingPeriod: number,
    bookkeeper: Bookkeeper,
    foldState: number
  ) {
    const tetuEarnedBefore = +utils.formatUnits(await bookkeeper.targetTokenEarned(strategy.address));
    await strategy.setFold(foldState);
    await VaultUtils.deposit(user, vault, deposit);
    const undBal = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);

    // * DO HARDWORK***********
    await TimeUtils.advanceNBlocks(investingPeriod);
    await vault.doHardWork();

    const tetuEarned = +utils.formatUnits(await bookkeeper.targetTokenEarned(strategy.address)) - tetuEarnedBefore;
    const undBalAfter = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);
    return {
      "underlyingProfit": undBalAfter - undBal,
      "tetuProfit": tetuEarned
    }
  }

}
