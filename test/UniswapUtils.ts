import {ethers} from "hardhat";
import {MaticAddresses} from "./MaticAddresses";
import {IUniswapV2Factory, IUniswapV2Pair, IUniswapV2Router02, PriceCalculator} from "../typechain";
import {BigNumber, utils} from "ethers";
import {Erc20Utils} from "./Erc20Utils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {RunHelper} from "../scripts/utils/RunHelper";
import {MintHelperUtils} from "./MintHelperUtils";
import {CoreContractsWrapper} from "./CoreContractsWrapper";

export class UniswapUtils {
  private static deadline = "1000000000000";

  public static async swapNETWORK_COINForExactTokens(
      signer: SignerWithAddress,
      path: string[],
      amount: string,
      routerAddress: string
  ) {
    const router = await UniswapUtils.connectRouter(routerAddress, signer);
    const networkCoinAmount = (await signer.getBalance())
    .sub(utils.parseEther("0.1"));
    console.log("networkCoinAmount", utils.formatUnits(networkCoinAmount));
    await router.swapETHForExactTokens(
        BigNumber.from(amount),
        path,
        signer.address,
        UniswapUtils.deadline,
        {value: networkCoinAmount}
    );
  }

  public static async swapExactTokensForTokens(
      sender: SignerWithAddress,
      _route: string[],
      amountToSell: string,
      _to: string,
      _router: string
  ) {
    const bal = await Erc20Utils.balanceOf(_route[0], sender.address);
    const decimals = await Erc20Utils.decimals(_route[0]);
    expect(+utils.formatUnits(bal, decimals)).is.greaterThanOrEqual(+utils.formatUnits(amountToSell, decimals),
        'Not enough ' + await Erc20Utils.tokenSymbol(_route[0]));

    const router = await UniswapUtils.connectRouter(_router, sender);
    await Erc20Utils.approve(_route[0], sender, router.address, amountToSell);
    return await router.swapExactTokensForTokens(
        BigNumber.from(amountToSell),
        BigNumber.from("0"),
        _route,
        _to,
        UniswapUtils.deadline
    );
  }

  public static async addLiquidity(
      sender: SignerWithAddress,
      tokenA: string,
      tokenB: string,
      amountA: string,
      amountB: string,
      _factory: string,
      _router: string,
      wait = false
  ): Promise<string> {
    const router = await UniswapUtils.connectRouter(_router, sender);
    await RunHelper.runAndWait(() => Erc20Utils.approve(tokenA, sender, router.address, amountA), true, wait);
    await RunHelper.runAndWait(() => Erc20Utils.approve(tokenB, sender, router.address, amountB), true, wait);
    await RunHelper.runAndWait(() => router.addLiquidity(
        tokenA,
        tokenB,
        amountA,
        amountB,
        1,
        1,
        sender.address,
        UniswapUtils.deadline
    ), true, wait);

    const factory = await UniswapUtils.connectFactory(_factory, sender);
    return factory.getPair(tokenA, tokenB);
  }

  public static async connectRouter(router: string, signer: SignerWithAddress): Promise<IUniswapV2Router02> {
    return await ethers.getContractAt("IUniswapV2Router02", router, signer) as IUniswapV2Router02;
  }

  public static async connectFactory(factory: string, signer: SignerWithAddress): Promise<IUniswapV2Factory> {
    return await ethers.getContractAt("IUniswapV2Factory", factory, signer) as IUniswapV2Factory;
  }

  public static async connectLpContract(adr: string, signer: SignerWithAddress): Promise<IUniswapV2Pair> {
    return await ethers.getContractAt("IUniswapV2Pair", adr, signer) as IUniswapV2Pair;
  }

  public static async getLpInfo(adr: string, signer: SignerWithAddress, targetToken: string): Promise<any[]> {
    const lp = await UniswapUtils.connectLpContract(adr, signer);
    const token0 = await lp.token0();
    const token1 = await lp.token1();

    const token0Decimals = await Erc20Utils.decimals(token0);
    const token1Decimals = await Erc20Utils.decimals(token1);

    const reserves = await lp.getReserves();
    const reserve0 = +utils.formatUnits(reserves[0], token0Decimals);
    const reserve1 = +utils.formatUnits(reserves[1], token1Decimals);

    const tokenStacked = (targetToken === token0) ? reserve0 : reserve1;
    const oppositeTokenStacked = (targetToken === token0) ? reserve1 : reserve0;
    const oppositeToken = (targetToken === token0) ? token1 : token0;


    let price;
    if (token0 == targetToken) {
      price = reserve1 / reserve0;
    } else {
      price = reserve0 / reserve1;
    }

    return [tokenStacked, oppositeToken, oppositeTokenStacked, price];
  }

  public static async createPairForRewardToken(
      signer: SignerWithAddress,
      core: CoreContractsWrapper,
      amount: string
  ) {
    await UniswapUtils.swapNETWORK_COINForExactTokens(
        signer,
        [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN],
        utils.parseUnits(amount, 6).toString(),
        MaticAddresses.QUICK_ROUTER
    );
    const rewardTokenAddress = core.rewardToken.address;

    const usdcBal = await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amount);

    await MintHelperUtils.mint(core.controller, core.announcer, amount, signer.address);

    const tokenBal = await Erc20Utils.balanceOf(rewardTokenAddress, signer.address);
    console.log('Token minted', tokenBal.toString());
    expect(+utils.formatUnits(tokenBal, 18)).is.greaterThanOrEqual(+amount);

    return await UniswapUtils.addLiquidity(
        signer,
        rewardTokenAddress,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits(amount, 18).toString(),
        utils.parseUnits(amount, 6).toString(),
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.QUICK_ROUTER
    );
  }

  public static async buyToken(
      signer: SignerWithAddress,
      router: string,
      token: string,
      amountForSell: BigNumber,
      oppositeToken: string = MaticAddresses.WMATIC_TOKEN,
      wait = false
  ) {
    const dec = await Erc20Utils.decimals(token);
    const symbol = await Erc20Utils.tokenSymbol(token);
    const balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(token, signer.address), dec);
    console.log('try to buy', symbol, amountForSell.toString(), 'balance', balanceBefore);
    if (token === MaticAddresses.WMATIC_TOKEN) {
      return await RunHelper.runAndWait(() =>
              Erc20Utils.wrapMatic(signer, utils.formatUnits(amountForSell, 18)),
          true, wait);
    } else {
      const oppositeTokenDec = await Erc20Utils.decimals(oppositeToken);
      const oppositeTokenBal = +utils.formatUnits(await Erc20Utils.balanceOf(oppositeToken, signer.address), oppositeTokenDec);
      if (oppositeTokenBal === 0) {
        throw Error('Need to refuel signer with ' + await Erc20Utils.tokenSymbol(oppositeToken) + ' ' + oppositeTokenBal);
      }
      return await RunHelper.runAndWait(() => UniswapUtils.swapExactTokensForTokens(
          signer,
          [oppositeToken, token],
          amountForSell.toString(),
          signer.address,
          router
      ), true, wait);
    }
  }

  public static async buyTokensAndAddLiq(
      signer: SignerWithAddress,
      factory0: string,
      factory1: string,
      targetFactory: string,
      token0: string,
      token0Opposite: string,
      token1: string,
      token1Opposite: string,
      amountForSell0: BigNumber,
      amountForSell1: BigNumber,
      wait = false
  ) {

    const token0Bal = await Erc20Utils.balanceOf(token0, signer.address);
    const token1Bal = await Erc20Utils.balanceOf(token1, signer.address);
    if (token0Bal.isZero()) {
      await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(factory0), token0, amountForSell0, token0Opposite, wait);
    }
    if (token1Bal.isZero()) {
      await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(factory1), token1, amountForSell1, token1Opposite, wait);
    }

    const factory = await UniswapUtils.connectFactory(targetFactory, signer);
    const lpToken = await factory.getPair(token0, token1);

    const lpBalanceBefore = await Erc20Utils.balanceOf(lpToken, signer.address);

    await UniswapUtils.addLiquidity(
        signer,
        token0,
        token1,
        (await Erc20Utils.balanceOf(token0, signer.address)).toString(),
        (await Erc20Utils.balanceOf(token1, signer.address)).toString(),
        targetFactory,
        MaticAddresses.getRouterByFactory(targetFactory),
        wait
    );

    const lpBalanceAfter = await Erc20Utils.balanceOf(lpToken, signer.address);
    const dec = await Erc20Utils.decimals(lpToken);
    const name = await Erc20Utils.tokenName(lpToken);
    const bought = lpBalanceAfter.sub(lpBalanceBefore);
    console.log('add liq', name, utils.formatUnits(bought, dec))
  }

  public static async wrapMatic(signer: SignerWithAddress) {
    await Erc20Utils.wrapMatic(signer, utils.formatUnits(utils.parseUnits('10000000'))); // 10m wmatic
  }

  public static async amountForSell(
      usdAmount: number,
      tokenAddress: string,
      priceCalculator: PriceCalculator
  ) {
    const dec = await Erc20Utils.decimals(tokenAddress);
    const price = await priceCalculator.getPriceWithDefaultOutput(tokenAddress);
    const D18 = BigNumber.from('1000000000000000000');
    return BigNumber.from(usdAmount).mul(D18).mul(BigNumber.from(1).pow(dec)).div(price)
  }

  public static async buyAllBigTokens(
      signer: SignerWithAddress
  ) {
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WETH_TOKEN, utils.parseUnits('5000000')); // ~500eth
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100'), MaticAddresses.WETH_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('1000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.QUICK_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.FRAX_TOKEN, utils.parseUnits('400'), MaticAddresses.QUICK_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.ANY_TOKEN, utils.parseUnits('200'), MaticAddresses.QUICK_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.QuickChart_TOKEN, utils.parseUnits('10'), MaticAddresses.QUICK_TOKEN);

  }

}
