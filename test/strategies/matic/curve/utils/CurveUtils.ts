import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, utils} from "ethers";
import {IAavePool, IERC20, IRenBTCPool, ITricryptoPool} from "../../../../../typechain";
import {MaticAddresses} from "../../../../MaticAddresses";
import {ethers} from "hardhat";
import {expect} from "chai";
import {UniswapUtils} from "../../../../UniswapUtils";
import {TokenUtils} from "../../../../TokenUtils";
import {DeployerUtils} from "../../../../../scripts/deploy/DeployerUtils";

export class CurveUtils {

  public static async addLiquidityAave(investor: SignerWithAddress) {
    await UniswapUtils.getTokenFromHolder(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('1000000'));
    const usdcUserBalance = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, investor.address);
    const aavePool = await ethers.getContractAt("IAavePool", MaticAddresses.CURVE_AAVE_POOL, investor) as IAavePool;
    const usdcToken = await ethers.getContractAt("IERC20", MaticAddresses.USDC_TOKEN, investor) as IERC20;
    await usdcToken.approve(MaticAddresses.CURVE_AAVE_POOL, usdcUserBalance, {from: investor.address});
    await aavePool.add_liquidity([0, usdcUserBalance, 0], 0, true);

  }

  public static async addLiquidityRen(investor: SignerWithAddress) {
    const dec = await TokenUtils.decimals(MaticAddresses.WBTC_TOKEN);
    const amount = utils.parseUnits('0.01', dec);
    await TokenUtils.getToken(MaticAddresses.WBTC_TOKEN, investor.address, amount);
    const renBTCPool = await ethers.getContractAt("IRenBTCPool", MaticAddresses.CURVE_renBTC_POOL, investor) as IRenBTCPool;
    await TokenUtils.approve(MaticAddresses.WBTC_TOKEN, investor, MaticAddresses.CURVE_renBTC_POOL, amount.toString());
    await renBTCPool.add_liquidity([amount, 0], 0, true);
  }

  public static async addLiquidityTrirypto(investor: SignerWithAddress) {
    console.log('try to deposit to atricrypto')
    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, investor.address, utils.parseUnits('10000', 6));
    const pool = await ethers.getContractAt("ITricryptoPool", MaticAddresses.CURVE_aTricrypto3_POOL, investor) as ITricryptoPool;
    const bal = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, investor.address);
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, investor, pool.address, bal.toString());
    await pool.add_liquidity([0, bal, 0, 0, 0], 0);
  }

  public static async swapTokensAAVE(trader: SignerWithAddress) {
    await UniswapUtils.getTokenFromHolder(trader, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000')); // 100m wmatic
    await UniswapUtils.getTokenFromHolder(trader, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('10000000'));

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

  public static async swapTricrypto(signer: SignerWithAddress) {
    console.log('swap tricrypto')
    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, signer.address, utils.parseUnits('10000', 6));
    const pool = await DeployerUtils.connectInterface(signer, 'ITricryptoPool', MaticAddresses.CURVE_aTricrypto3_POOL) as ITricryptoPool;
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, pool.address, utils.parseUnits('10000', 6).mul(2).toString());
    await pool.exchange_underlying(1, 0, utils.parseUnits('10000', 6), 0, signer.address);
    console.log('swap tricrypto completed')
  }
}
