import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {PriceCalculator, SmartVault, StrategyAaveFold} from "../../../../typechain";
import {ethers} from "hardhat";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {TimeUtils} from "../../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneAaveFoldStrategyTest: {
      type: "number",
      default: 0,
    }
  }).argv;

const {expect} = chai;
chai.use(chaiAsPromised);


// skipped as it relaying on the internal strategy checks
//   function claimRewardPublic() public {
//     claimReward();
//   }
// the purpose of this test is to debug folding profitability.

describe('Universal Aave Fold profitability tests (strategy internals required)', async () => {

describe.skip('Universal Aave Fold profitability tests', async () => {

  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const start = info.split(',');
    const idx = start[0];
    const tokenName = start[1];
    const token = start[2];
    const aTokenName = start[3];
    const aTokenAddress = start[4];
    const dTokenAddress = start[6];
    const ltv = start[7];
    const usageAsCollateralEnabled = start[9];
    const borrowingEnabled = start[10];
    const ltvNum = Number(ltv);
    const collateralFactor = (ltvNum).toString();
    const borrowTarget = (ltvNum * 0.99).toString();

    let vault: SmartVault;
    let strategy: StrategyAaveFold;
    let lpForTargetToken;

    if (!idx || idx === 'idx' || usageAsCollateralEnabled !== "true" || borrowingEnabled !== "true") {
      console.log('skip ', tokenName);
      return;
    }

    console.log('strat', idx, aTokenName);

    describe(tokenName + " Test", async function () {
      let snapshotBefore: string;
      let snapshot: string;
      const underlying = token;

      const aToken = aTokenAddress;
      const debtToken = dTokenAddress;
      let deposit = "1000"
      if (tokenName === "WBTC") {
        deposit = "1";
      }
      const investingPeriod = 60 * 60 * 24 * 30;

      let user: SignerWithAddress;
      let core: CoreContractsWrapper;
      let calculator: PriceCalculator;

      before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        const signer = await DeployerUtils.impersonate();
        user = (await ethers.getSigners())[1];
        const undDec = await TokenUtils.decimals(underlying);

        core = await DeployerUtils.getCoreAddressesWrapper(signer);
        calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

        const data = await StrategyTestUtils.deploy(
          signer,
          core,
          tokenName,
          async vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyAaveFold',
            core.controller.address,
            vaultAddress,
            underlying,
            borrowTarget,
            collateralFactor,
          ) as Promise<StrategyAaveFold>,
          underlying
        );

        vault = data[0];
        strategy = data[1] as StrategyAaveFold;
        lpForTargetToken = data[2];

        await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

        await core.vaultController.changePpfsDecreasePermissions([vault.address], true);
        // ************** add funds for investing ************
        await TokenUtils.getToken(underlying, user.address, utils.parseUnits(deposit, undDec))
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

      // it("Folding profitability calculations", async () => {
      //
      //   const vaultForUser = vault.connect(user);
      //   const rt0 = (await vaultForUser.rewardTokens())[0];
      //   const userUnderlyingBalance = await TokenUtils.balanceOf(underlying, user.address);
      //   const undDec = await TokenUtils.decimals(underlying);
      //
      //   const isFoldEnabled = usageAsCollateralEnabled !== "true";
      //   await strategy.setFold(isFoldEnabled);
      //   console.log("deposit", deposit);
      //   await VaultUtils.deposit(user, vault, utils.parseUnits(deposit, undDec));
      //
      //   const atDecimals = await TokenUtils.decimals(aToken);
      //   const dtDecimals = await TokenUtils.decimals(debtToken);
      //   const rtDecimals = await TokenUtils.decimals(MaticAddresses.WMATIC_TOKEN);
      //
      //   const rewardBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, user.address);
      //   console.log("rewardBalanceBefore: ", rewardBalanceBefore.toString());
      //
      //   const vaultBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, vault.address);
      //   console.log("vaultBalanceBefore: ", vaultBalanceBefore.toString());
      //
      //   const underlyingBalanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(aToken, strategy.address), atDecimals);
      //   console.log("underlyingBalanceBefore: ", underlyingBalanceBefore.toString());
      //
      //   const debtBalanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(debtToken, strategy.address), dtDecimals);
      //   console.log("debtBalanceBefore: ", debtBalanceBefore.toString());
      //
      //   const maticBefore = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address), rtDecimals);
      //
      //   console.log("MATIC before: ", maticBefore.toString());
      //   const data = await strategy.totalRewardPrediction(investingPeriod);
      //
      //   const supplyRewards = +utils.formatUnits(data[0], atDecimals) * Number(underlyingBalanceBefore);
      //   const borrowRewards = +utils.formatUnits(data[1], dtDecimals) * Number(debtBalanceBefore);
      //   let supplyUnderlyingProfitPredicted = +utils.formatUnits(data[2], 18) * Number(underlyingBalanceBefore);
      //   const debtUnderlyingCostPredicted = +utils.formatUnits(data[3], 18) * Number(debtBalanceBefore);
      //
      //   console.log("supplyRewards:", supplyRewards);
      //   console.log("borrowRewards:", borrowRewards);
      //   console.log("supplyUnderlyingProfitPredicted:", supplyUnderlyingProfitPredicted);
      //   console.log("debtUnderlyingCostPredicted :", debtUnderlyingCostPredicted);
      //   console.log("======================================");
      //
      //
      //   const dataWeth = await strategy.totalRewardPredictionInWeth(investingPeriod);
      //
      //   const supplyRewardsWeth = +utils.formatUnits(dataWeth[0], rtDecimals);
      //   const borrowRewardsWeth = +utils.formatUnits(dataWeth[1], rtDecimals);
      //   const supplyUnderlyingProfitWeth = +utils.formatUnits(dataWeth[2], atDecimals);
      //   const debtUnderlyingCostWeth = +utils.formatUnits(dataWeth[3], dtDecimals);
      //   let foldingProfPerToken;
      //   if (isFoldEnabled){
      //     foldingProfPerToken = supplyRewardsWeth + borrowRewardsWeth + supplyUnderlyingProfitWeth - debtUnderlyingCostWeth;
      //   }else {
      //     foldingProfPerToken = supplyRewardsWeth + supplyUnderlyingProfitWeth;
      //   }
      //   console.log("supplyRewardsWeth:", supplyRewardsWeth, "borrowRewardsWeth:", borrowRewardsWeth);
      //   console.log("supplyUnderlyingProfitWeth:", supplyUnderlyingProfitWeth, "debtUnderlyingCostWeth:", debtUnderlyingCostWeth);
      //   console.log("======================================");
      //   console.log("Total foldingProfPerToken WETH:", foldingProfPerToken);
      //   // expect(foldingProfPerToken).is.greaterThan(0);
      //
      //   await TimeUtils.advanceBlocksOnTs(investingPeriod);
      //   await strategy.claimRewardPublic();
      //
      //   const underlyingBalanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(aToken, strategy.address), atDecimals);
      //
      //   console.log("underlyingBalanceAfter: ", underlyingBalanceAfter.toString());
      //
      //   const debtBalanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(debtToken, strategy.address), dtDecimals);
      //   console.log("debtBalanceAfter: ", debtBalanceAfter.toString());
      //
      //   const debtCost = debtBalanceAfter - debtBalanceBefore;
      //   console.log("debtCost: ", debtCost.toString());
      //   const rewardsEarned = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address), rtDecimals);
      //   console.log("MATIC earned: ", rewardsEarned.toString());
      //
      //   const underlyingEarned = underlyingBalanceAfter - underlyingBalanceBefore;
      //   console.log("UNDERLYING earned from supply: ", underlyingEarned.toString());
      //
      //   const underlyingEarnedTotal = underlyingEarned - debtCost;
      //   console.log("UNDERLYING earned Total: ", underlyingEarnedTotal);
      //
      //
      //   let rewardProfitPrediction = supplyRewards;
      //   if (isFoldEnabled){
      //     rewardProfitPrediction += borrowRewards;
      //   }
      //   console.log("rewardProfitPrediction (MATIC): ", rewardProfitPrediction.toString());
      //
      //   expect(rewardsEarned).is.approximately(rewardProfitPrediction, rewardProfitPrediction * 0.001, "Prediction of rewards profit is inaccurate")
      //
      //   console.log("underlyingEarnedPredicted: ", supplyUnderlyingProfitPredicted.toString());
      //
      //   console.log("debtUnderlyingCostPredicted: ", debtUnderlyingCostPredicted.toString());
      //
      //   if (debtCost > 0) {
      //     supplyUnderlyingProfitPredicted = supplyUnderlyingProfitPredicted - debtUnderlyingCostPredicted;
      //   }
      //   expect(supplyUnderlyingProfitPredicted).is.approximately(underlyingEarnedTotal, Math.abs(underlyingEarnedTotal) * 0.1, "Prediction of underlying profit is inaccurate");
      //
      // });

    });


  });
});
});

