import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, utils} from "ethers";
import {
    FeeRewardForwarder,
    IAavePool,
    IERC20,
    IRenBTCPool,
    RewardToken
} from "../../../../../typechain";
import {MaticAddresses} from "../../../../MaticAddresses";
import {ethers} from "hardhat";
import {expect} from "chai";
import {UniswapUtils} from "../../../../UniswapUtils";
import {TokenUtils} from "../../../../TokenUtils";

export class CurveUtils {

    public static async configureFeeRewardForwarder(feeRewardForwarder: FeeRewardForwarder, rewardToken: RewardToken) {
        for (const rt of [MaticAddresses.WMATIC_TOKEN, MaticAddresses.CRV_TOKEN]) {
            await feeRewardForwarder.setConversionPath(
                [rt, MaticAddresses.USDC_TOKEN, rewardToken.address],
                [MaticAddresses.SUSHI_ROUTER, MaticAddresses.QUICK_ROUTER]
            );
            await feeRewardForwarder.setConversionPath(
                [rt, MaticAddresses.USDC_TOKEN],
                [MaticAddresses.SUSHI_ROUTER]
            );
        }
        await feeRewardForwarder.setLiquidityNumerator(50);
        await feeRewardForwarder.setLiquidityRouter(MaticAddresses.QUICK_ROUTER);
    }

    public static async addLiquidityAave(investor: SignerWithAddress) {
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('100000000'));
        const usdcUserBalance = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, investor.address);
        const aavePool = await ethers.getContractAt("IAavePool", MaticAddresses.CURVE_AAVE_POOL, investor) as IAavePool;
        const usdcToken = await ethers.getContractAt("IERC20", MaticAddresses.USDC_TOKEN, investor) as IERC20;
        await usdcToken.approve(MaticAddresses.CURVE_AAVE_POOL, usdcUserBalance, {from: investor.address});
        await aavePool.add_liquidity([0, usdcUserBalance, 0], 0, true);

    }

    public static async addLiquidityRen(investor: SignerWithAddress) {
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000')); // 100m wmatic
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('2053400'));
        const renBTCPool = await ethers.getContractAt("IRenBTCPool", MaticAddresses.CURVE_renBTC_POOL, investor) as IRenBTCPool;
        const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, investor) as IERC20;
        await wbtcToken.approve(MaticAddresses.CURVE_renBTC_POOL, "2053400", {from: investor.address});
        await renBTCPool.add_liquidity([2053400, 0], 0, true);
    }

    public static async swapTokensAAVE(trader: SignerWithAddress) {
        await UniswapUtils.buyToken(trader, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000')); // 100m wmatic
        await UniswapUtils.buyToken(trader, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('10000000'));

        const usdcToken = await ethers.getContractAt("IERC20", MaticAddresses.USDC_TOKEN, trader) as IERC20;
        const usdcUserBalance = await usdcToken.balanceOf(trader.address);
        expect(usdcUserBalance).is.not.eq("0", "user should have some USDC tokens to swap");
        const depContract = await ethers.getContractAt("IAavePool", MaticAddresses.CURVE_AAVE_POOL, trader) as IAavePool;
        await usdcToken.approve(MaticAddresses.CURVE_AAVE_POOL, usdcUserBalance, {from: trader.address});
        // swap usdc to dai
        await depContract.exchange_underlying(1, 0, usdcUserBalance, BigNumber.from("0"), {from: trader.address});
        const daiToken = await ethers.getContractAt("IERC20", MaticAddresses.DAI_TOKEN, trader) as IERC20;
        const daiTokenBalance = await daiToken.balanceOf(trader.address);
        await daiToken.approve(MaticAddresses.CURVE_AAVE_POOL, daiTokenBalance, {from: trader.address});
        // swap dai to usdc
        await depContract.exchange_underlying(0, 1, daiTokenBalance, BigNumber.from("0"), {from: trader.address});
    }
}
