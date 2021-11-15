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
import {BigNumber, utils} from "ethers";
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

describe('Universal Aave Fold profitability tests', async () => {

  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const aTokenName = strat[1];
    const aTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    // const collateralFactor = strat[5];
    // const borrowTarget = strat[6];

    let vault: SmartVault;
    let strategy: StrategyAaveFold;
    let lpForTargetToken;

    // if (!idx || idx === 'idx' || collateralFactor === '0') {
    if (!idx || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    console.log('strat', idx, aTokenName);

    describe(tokenName + "Test", async function () {
      let snapshotBefore: string;
      let snapshot: string;
      const underlying = token;

      const aToken = aTokenAddress;
      // const debtToken = "0x75c4d1fb84429023170086f06e682dcbbf537b7d"; //DAI
      const debtToken = "0x21f67830d72fea2e759df0aa7c698cdd542da1dd"; //USDC
      const deposit = "1000"
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
            "5000",
            "6000"
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

      it("Folding profitability calculations", async () => {

        const vaultForUser = vault.connect(user);
        const rt0 = (await vaultForUser.rewardTokens())[0];
        const userUnderlyingBalance = await TokenUtils.balanceOf(underlying, user.address);
        const undDec = await TokenUtils.decimals(underlying);

        await strategy.setFold(false);


        console.log("deposit", deposit);
        await VaultUtils.deposit(user, vault, utils.parseUnits(deposit, undDec));

        const atDecimals = await TokenUtils.decimals(aToken);
        const dtDecimals = await TokenUtils.decimals(debtToken);
        const rtDecimals = await TokenUtils.decimals(MaticAddresses.WMATIC_TOKEN);

        const rewardBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, user.address);
        console.log("rewardBalanceBefore: ", rewardBalanceBefore.toString());

        const vaultBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, vault.address);
        console.log("vaultBalanceBefore: ", vaultBalanceBefore.toString());

        const underlyingBalanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(aToken, strategy.address), atDecimals);
        console.log("underlyingBalanceBefore: ", underlyingBalanceBefore.toString());

        const debtBalanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(debtToken, strategy.address), dtDecimals);
        console.log("debtBalanceBefore: ", debtBalanceBefore.toString());

        const maticBefore = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address), rtDecimals);

        console.log("MATIC before: ", maticBefore.toString());
        let data = await strategy.totalRewardPrediction(investingPeriod);

        let supplyRewards = +utils.formatUnits(data[0], rtDecimals);
        let borrowRewards = +utils.formatUnits(data[1], rtDecimals);
        let supplyUnderlyingProfit = +utils.formatUnits(data[2], atDecimals);
        let debtUnderlyingCost = +utils.formatUnits(data[3], dtDecimals);

        console.log("supplyRewards:", supplyRewards);
        console.log("borrowRewards:", borrowRewards);
        console.log("supplyUnderlyingProfit:", supplyUnderlyingProfit);
        console.log("debtUnderlyingCost:", debtUnderlyingCost);
        console.log("======================================");


        let dataWeth = await strategy.totalRewardPredictionInWeth(investingPeriod);

        let supplyRewardsWeth = +utils.formatUnits(dataWeth[0], rtDecimals);
        let borrowRewardsWeth = +utils.formatUnits(dataWeth[1], rtDecimals);
        let supplyUnderlyingProfitWeth = +utils.formatUnits(dataWeth[2], atDecimals);
        let debtUnderlyingCostWeth = +utils.formatUnits(dataWeth[3], dtDecimals);
        let totalWethEarned = supplyRewardsWeth+borrowRewardsWeth+supplyUnderlyingProfitWeth-debtUnderlyingCostWeth;

        console.log("supplyRewardsWeth:", supplyRewardsWeth, "borrowRewardsWeth:", borrowRewardsWeth);
        console.log("supplyUnderlyingProfitWeth:", supplyUnderlyingProfitWeth, "debtUnderlyingCostWeth:", debtUnderlyingCostWeth);
        console.log("======================================");
        console.log("Total earned WETH:", totalWethEarned);
        expect(totalWethEarned).is.greaterThan(0);

        let dataWethNorm = await strategy.normTotalRewardPredictionInWeth(investingPeriod);
        let supplyRewardsWethN = +utils.formatUnits(dataWethNorm[0], rtDecimals);
        let borrowRewardsWethN = +utils.formatUnits(dataWethNorm[1], rtDecimals);
        let supplyUnderlyingProfitWethN = +utils.formatUnits(dataWethNorm[2], rtDecimals);
        let debtUnderlyingCostWethN = +utils.formatUnits(dataWethNorm[3], rtDecimals);
        let foldingProfPerToken = supplyRewardsWeth+borrowRewardsWeth+supplyUnderlyingProfitWeth-debtUnderlyingCostWeth;

        console.log("supplyRewardsWethN:", supplyRewardsWethN, "borrowRewardsWethN:", borrowRewardsWethN);
        console.log("supplyUnderlyingProfitWethN:", supplyUnderlyingProfitWethN, "debtUnderlyingCostWethN:", debtUnderlyingCostWethN);
        console.log("======================================");
        console.log("Total foldingProfPerToken WETH:", foldingProfPerToken);
        expect(foldingProfPerToken).is.greaterThan(0);

        await TimeUtils.advanceBlocksOnTs(investingPeriod);
        await strategy.claimRewardPublic();
        // await strategy.doHardWork();

        // const vaultBalanceAfter = await TokenUtils.balanceOf(core.psVault.address, vault.address);
        //
        // expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");
        //


        const underlyingBalanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(aToken, strategy.address), atDecimals);

        console.log("underlyingBalanceAfter: ", underlyingBalanceAfter.toString());

        const debtBalanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(debtToken, strategy.address), dtDecimals);
        console.log("debtBalanceAfter: ", debtBalanceAfter.toString());

        const debtCost = debtBalanceAfter - debtBalanceBefore;
        console.log("debtCost: ", debtCost.toString());


        const rewardsEarned = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address), rtDecimals);

        console.log("MATIC earned: ", rewardsEarned.toString());
        const underlyingEarned = underlyingBalanceAfter - underlyingBalanceBefore - debtCost;
        console.log("DAI earned: ", underlyingEarned.toString());

        let rewardProfitPrediction = supplyRewards + borrowRewards;

        console.log("rewardProfitPrediction (MATIC): ", rewardProfitPrediction.toString());

        expect(rewardsEarned).is.approximately(rewardProfitPrediction, rewardProfitPrediction * 0.001, "Prediction of rewards profit is inaccurate")

        console.log("underlyingEarnedPredicted: ", supplyUnderlyingProfit.toString());

        console.log("debtUnderlyingCostPredicted: ", debtUnderlyingCost.toString());

        if(debtCost > 0){
          supplyUnderlyingProfit = supplyUnderlyingProfit - debtUnderlyingCost;
        }
        expect(supplyUnderlyingProfit).is.approximately(underlyingEarned, underlyingEarned * 0.01, "Prediction of underlying profit is inaccurate");

      });

    });


  });
});
