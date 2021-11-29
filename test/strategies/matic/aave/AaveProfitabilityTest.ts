import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {
  Bookkeeper,
  IERC20,
  PriceCalculator,
  SmartVault,
  StrategyAaveFold
} from "../../../../typechain";
import {TimeUtils} from "../../../TimeUtils";
import {VaultUtils} from "../../../VaultUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {PriceCalculatorUtils} from "../../../PriceCalculatorUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class AaveProfitabilityTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("AAVE profitability test", async function () {
      const calculator = deployInfo.tools?.calculator as PriceCalculator;
      const bookkeeper = deployInfo?.core?.bookkeeper as Bookkeeper;
      const tetu = deployInfo?.core?.rewardToken as IERC20;
      const strategy = (deployInfo?.strategy as StrategyAaveFold);
      const underlying = deployInfo?.underlying as string;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;

      const uDec = await TokenUtils.decimals(underlying);
      const uPrice = await PriceCalculatorUtils.getPriceCached(underlying);
      const uPriceN = +utils.formatUnits(uPrice);
      const amount = 100000 / uPriceN;
      const amountN = utils.parseUnits(amount.toFixed(uDec), uDec);
      await TokenUtils.getToken(underlying, user.address, amountN);

      const underlyingUSDPrice = +utils.formatUnits(await PriceCalculatorUtils.getPriceCached(underlying));
      const tetuUSDCPrice = +utils.formatUnits(await PriceCalculatorUtils.getPriceCached(tetu.address));
      console.log("underlyingUSDPrice ", underlyingUSDPrice);
      console.log("tetuUSDCPrice ", tetuUSDCPrice);

      const investingPeriod = 60 * 60 * 24 * 30;
      const deposit = await TokenUtils.balanceOf(underlying, user.address);

      expect(await bookkeeper.targetTokenEarned(strategy.address)).is.eq(0);

      const und = await vault.underlying();
      const undDec = await TokenUtils.decimals(und);
      const isFoldingProfitable = await strategy.isFoldingProfitable();
      // if (!isFoldingProfitable) {
      //   console.log("Folding is not profitable for: ", tokenName);
      //   return;
      // }
      console.log("Is Folding profitable: ", isFoldingProfitable);
      const snapshotFolding = await TimeUtils.snapshot();
      console.log("Folding disabled");
      await strategy.setFold(false);
      console.log("deposit", deposit);
      await VaultUtils.deposit(user, vault, deposit);
      const undBal1 = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);

      await TimeUtils.advanceBlocksOnTs(investingPeriod);
      await vault.doHardWork();

      const tetuEarned1 = +utils.formatUnits(await bookkeeper.targetTokenEarned(strategy.address));
      const undBalAfterR1 = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);
      const lendingUnderlyingProfit = undBalAfterR1 - undBal1;
      const lendingTetuProfit = tetuEarned1;
      await TimeUtils.rollback(snapshotFolding);
      console.log("Folding enabled");
      await strategy.setFold(true);
      await VaultUtils.deposit(user, vault, deposit);
      const undBal2 = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);

      await TimeUtils.advanceBlocksOnTs(investingPeriod);
      await vault.doHardWork();

      const tetuEarned2 = +utils.formatUnits(await bookkeeper.targetTokenEarned(strategy.address));
      const undBalAfterR2 = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);
      const foldingUnderlyingProfit = undBalAfterR2 - undBal2;
      const foldingTetuProfit = tetuEarned2;

      const lendingUnderlyingProfitUSD = lendingUnderlyingProfit * underlyingUSDPrice;
      const foldingUnderlyingProfitUSD = foldingUnderlyingProfit * underlyingUSDPrice;
      const lendingTetuProfitUSD = lendingTetuProfit * tetuUSDCPrice;
      const foldingTetuProfitUSD = foldingTetuProfit * tetuUSDCPrice;
      const totalLendingProfitUSD = lendingUnderlyingProfitUSD + lendingTetuProfitUSD;
      const totalFoldingProfitUSD = foldingTetuProfitUSD + foldingUnderlyingProfitUSD;

      console.log("===========================");
      console.log("=========Lending===========");
      console.log("Underlying: ", lendingUnderlyingProfit, "Tetu: ", lendingTetuProfit);
      console.log("=========Folding===========");
      console.log("Underlying: ", foldingUnderlyingProfit, "Tetu: ", foldingTetuProfit);
      console.log("===========================");
      console.log("Total lending profit: ", totalLendingProfitUSD);
      console.log("Total folding profit: ", totalFoldingProfitUSD);
      console.log("Difference: ", totalFoldingProfitUSD / totalLendingProfitUSD * 100, "%");
    });
  }

}
