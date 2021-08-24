import { expect } from "chai";
import { MaticAddresses } from "../../../../MaticAddresses";
import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import { Erc20Utils } from "../../../../Erc20Utils";
import { IGauge } from "../../../../../typechain";
import { StrategyInfo } from "../../../StrategyInfo";
import { TimeUtils } from "../../../../TimeUtils";
import { StrategyTestUtils } from "../../../StrategyTestUtils";
import { swapTokensAAVE } from "./CurveUtils";
import { VaultUtils } from "../../../../VaultUtils";

export class CurveDoHardWorkLoop {

    public static async doHardWorkWithLiqPath(strategyInfo: StrategyInfo, gagueAddress: string) {
        await StrategyTestUtils.updatePSRatio(strategyInfo.core.announcer, strategyInfo.core.controller, 500, 1000)
        const vaultForUser = strategyInfo.vault.connect(strategyInfo.user);

        const xTetu = (await vaultForUser.rewardTokens())[0];
        const userUnderlyingBalance = await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address);

        console.log("User Underlying Balance to deposit", userUnderlyingBalance.toString());
        await VaultUtils.deposit(strategyInfo.user, strategyInfo.vault, BigNumber.from(userUnderlyingBalance));

        const rewardBalanceBefore = await Erc20Utils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.user.address);
        const vaultBalanceBefore = await Erc20Utils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.vault.address);
        const psBalanceBefore = await Erc20Utils.balanceOf(strategyInfo.core.rewardToken.address, strategyInfo.core.psVault.address);
        const userEarnedTotalxTetu = await strategyInfo.core.bookkeeper.userEarned(strategyInfo.user.address, strategyInfo.vault.address, xTetu);

        let trader = (await ethers.getSigners())[2];
        await swapTokensAAVE(trader);

        await TimeUtils.advanceBlocksOnTs(2700*7);

        //we need to call claimable_reward_write to checkpoint rewards (curve mechanic)
        let gaugeContract = await ethers.getContractAt("IGauge", gagueAddress) as IGauge;

        await gaugeContract.claimable_reward_write(strategyInfo.strategy.address, MaticAddresses.WMATIC_TOKEN);

        let totalToClaim = await StrategyTestUtils.calculateTotalToClaim(strategyInfo.calculator, 
          strategyInfo.strategy, strategyInfo.core.rewardToken);

        await strategyInfo.vault.doHardWork();

        const earned = +utils.formatUnits(await strategyInfo.core.bookkeeper.targetTokenEarned(strategyInfo.strategy.address));
        console.log('earned', earned, totalToClaim);
        
        expect(earned).is.approximately(totalToClaim, totalToClaim * 2); // very approximately
        await StrategyTestUtils.checkStrategyRewardsBalance(strategyInfo.strategy, ['0', '0']);

        // check vault balance
        const vaultBalanceAfter = await Erc20Utils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.vault.address);
        expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");

        // check ps balance
        const psBalanceAfter = await Erc20Utils.balanceOf(strategyInfo.core.rewardToken.address, strategyInfo.core.psVault.address);
        expect(psBalanceAfter.sub(psBalanceBefore)).is.not.eq("0", "ps balance should increase");

        // check reward for user
        await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7); // 1 week
        await vaultForUser.getAllRewards();
        const rewardBalanceAfter = await Erc20Utils.balanceOf(strategyInfo.core.psVault.address, strategyInfo.user.address);
        expect(rewardBalanceAfter.sub(rewardBalanceBefore).toString()).is.not.eq("0", "should have earned iToken rewards");

        // ************* EXIT ***************
        await strategyInfo.strategy.emergencyExit();
        await vaultForUser.exit();
        const userUnderlyingBalanceAfter = await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address);
        expect(userUnderlyingBalanceAfter).is.eq(userUnderlyingBalance, "should have all underlying");

        const userEarnedTotalAfterRt0 = await strategyInfo.core.bookkeeper.userEarned(strategyInfo.user.address, strategyInfo.vault.address, xTetu);
        console.log('user total earned xTetu', +utils.formatUnits(userEarnedTotalxTetu), 
        +utils.formatUnits(userEarnedTotalAfterRt0), +utils.formatUnits(userEarnedTotalAfterRt0) - +utils.formatUnits(userEarnedTotalxTetu))
        expect(+utils.formatUnits(userEarnedTotalAfterRt0)).is.greaterThan(+utils.formatUnits(userEarnedTotalxTetu));

    };
}