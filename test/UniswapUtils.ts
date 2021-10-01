import {ethers} from "hardhat";
import {MaticAddresses} from "./MaticAddresses";
import {
  IFireBirdFactory,
  IFireBirdRouter,
  IUniswapV2Factory,
  IUniswapV2Pair,
  IUniswapV2Router02,
  PriceCalculator
} from "../typechain";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "./TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {RunHelper} from "../scripts/utils/RunHelper";
import {MintHelperUtils} from "./MintHelperUtils";
import {CoreContractsWrapper} from "./CoreContractsWrapper";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";

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
    const bal = await TokenUtils.balanceOf(_route[0], sender.address);
    const decimals = await TokenUtils.decimals(_route[0]);
    expect(+utils.formatUnits(bal, decimals)).is.greaterThanOrEqual(+utils.formatUnits(amountToSell, decimals),
        'Not enough ' + await TokenUtils.tokenSymbol(_route[0]));

    if(_router.toLowerCase() === MaticAddresses.FIREBIRD_ROUTER) {
      console.log("firebird swap")
      expect(_route.length === 2, 'firebird wrong length path');
      const router = await ethers.getContractAt("IFireBirdRouter", _router, sender) as IFireBirdRouter;
      await TokenUtils.approve(_route[0], sender, router.address, amountToSell);

      const fbFac = await DeployerUtils.connectInterface(sender, 'IFireBirdFactory', MaticAddresses.FIREBIRD_FACTORY) as IFireBirdFactory;
      const fbPair = await fbFac.getPair(_route[0], _route[1], 50, 20);
      return await router.swapExactTokensForTokens(
          _route[0],
          _route[1],
          BigNumber.from(amountToSell),
          BigNumber.from("0"),
          [fbPair],
          _to,
          UniswapUtils.deadline
      );
    } else {
      const router = await UniswapUtils.connectRouter(_router, sender);
      await TokenUtils.approve(_route[0], sender, router.address, amountToSell);
      return await router.swapExactTokensForTokens(
          BigNumber.from(amountToSell),
          BigNumber.from("0"),
          _route,
          _to,
          UniswapUtils.deadline
      );
    }
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
    const t0Dec = await TokenUtils.decimals(tokenA);
    const t1Dec = await TokenUtils.decimals(tokenB);
    const name0 = await TokenUtils.tokenSymbol(tokenA);
    const name1 = await TokenUtils.tokenSymbol(tokenB);
    const bal0 = await TokenUtils.balanceOf(tokenA, sender.address);
    const bal1 = await TokenUtils.balanceOf(tokenB, sender.address);

    expect(+utils.formatUnits(bal0, t0Dec))
    .is.greaterThanOrEqual(+utils.formatUnits(amountA, t0Dec), 'not enough bal for token A ' + name0);
    expect(+utils.formatUnits(bal1, t1Dec))
    .is.greaterThanOrEqual(+utils.formatUnits(amountB, t1Dec), 'not enough bal for token B ' + name1);


    await RunHelper.runAndWait(() => TokenUtils.approve(tokenA, sender, _router, amountA), true, wait);
    await RunHelper.runAndWait(() => TokenUtils.approve(tokenB, sender, _router, amountB), true, wait);

    if (_factory.toLowerCase() === MaticAddresses.FIREBIRD_FACTORY.toLowerCase()) {
      const pair = await UniswapUtils.getPairFromFactory(sender, tokenA, tokenB, _factory);
      const router = await DeployerUtils.connectInterface(sender, 'IFireBirdRouter', _router) as IFireBirdRouter
      await RunHelper.runAndWait(() => router.addLiquidity(
          pair,
          tokenA,
          tokenB,
          amountA,
          amountB,
          1,
          1,
          sender.address,
          UniswapUtils.deadline
      ), true, wait);
    } else {
      const router = await UniswapUtils.connectRouter(_router, sender);
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
    }

    const factory = await UniswapUtils.connectFactory(_factory, sender);
    return await UniswapUtils.getPairFromFactory(sender, tokenA, tokenB, factory.address);
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

    const token0Decimals = await TokenUtils.decimals(token0);
    const token1Decimals = await TokenUtils.decimals(token1);

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

    const usdcBal = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amount);

    await MintHelperUtils.mint(core.controller, core.announcer, amount, signer.address);

    const tokenBal = await TokenUtils.balanceOf(rewardTokenAddress, signer.address);
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
    const dec = await TokenUtils.decimals(token);
    const symbol = await TokenUtils.tokenSymbol(token);
    const balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(token, signer.address), dec);
    console.log('try to buy', symbol, amountForSell.toString(), 'balance', balanceBefore);
    if (token === MaticAddresses.WMATIC_TOKEN) {
      return await RunHelper.runAndWait(() =>
              TokenUtils.wrapMatic(signer, utils.formatUnits(amountForSell, 18)),
          true, wait);
    } else {
      const oppositeTokenDec = await TokenUtils.decimals(oppositeToken);
      const oppositeTokenBal = +utils.formatUnits(await TokenUtils.balanceOf(oppositeToken, signer.address), oppositeTokenDec);
      if (oppositeTokenBal === 0) {
        throw Error('Need to refuel signer with ' + await TokenUtils.tokenSymbol(oppositeToken) + ' ' + oppositeTokenBal);
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

    const token0Bal = await TokenUtils.balanceOf(token0, signer.address);
    const token1Bal = await TokenUtils.balanceOf(token1, signer.address);
    if (token0Bal.isZero()) {
      await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(factory0), token0, amountForSell0, token0Opposite, wait);
    }
    if (token1Bal.isZero()) {
      await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(factory1), token1, amountForSell1, token1Opposite, wait);
    }

    let lpToken = await UniswapUtils.getPairFromFactory(signer, token0, token1, targetFactory);

    const lpBalanceBefore = await TokenUtils.balanceOf(lpToken, signer.address);

    await UniswapUtils.addLiquidity(
        signer,
        token0,
        token1,
        (await TokenUtils.balanceOf(token0, signer.address)).toString(),
        (await TokenUtils.balanceOf(token1, signer.address)).toString(),
        targetFactory,
        MaticAddresses.getRouterByFactory(targetFactory),
        wait
    );

    const lpBalanceAfter = await TokenUtils.balanceOf(lpToken, signer.address);
    const dec = await TokenUtils.decimals(lpToken);
    const name = await TokenUtils.tokenName(lpToken);
    const bought = lpBalanceAfter.sub(lpBalanceBefore);
    console.log('add liq', name, utils.formatUnits(bought, dec))
    console.log('lpToken', lpToken);
  }

  public static async wrapMatic(signer: SignerWithAddress) {
    await TokenUtils.wrapMatic(signer, utils.formatUnits(utils.parseUnits('10000000'))); // 10m wmatic
  }

  public static async amountForSell(
      usdAmount: number,
      tokenAddress: string,
      priceCalculator: PriceCalculator
  ) {
    const dec = await TokenUtils.decimals(tokenAddress);
    const price = await priceCalculator.getPriceWithDefaultOutput(tokenAddress);
    const D18 = BigNumber.from('1000000000000000000');
    return BigNumber.from(usdAmount).mul(D18).mul(BigNumber.from(1).pow(dec)).div(price)
  }

  public static async getPairFromFactory(signer: SignerWithAddress, token0: string, token1: string, factory: string): Promise<string> {
    if (factory.toLowerCase() === MaticAddresses.FIREBIRD_FACTORY.toLowerCase()) {
      console.log('Firebird factory');
      const factoryCtr = await DeployerUtils.connectInterface(signer, 'IFireBirdFactory', factory) as IFireBirdFactory;
      return await factoryCtr.getPair(token0, token1, 50, 20);
    } else {
      const factoryCtr = await UniswapUtils.connectFactory(factory, signer);
      return await factoryCtr.getPair(token0, token1);
    }
  }

  public static async buyAllBigTokens(
      signer: SignerWithAddress
  ) {
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000')); // 500m wmatic
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WETH_TOKEN, utils.parseUnits('10000000')); // ~1keth
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('200'), MaticAddresses.WETH_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDT_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.QUICK_TOKEN, utils.parseUnits('4000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.FRAX_TOKEN, utils.parseUnits('400'), MaticAddresses.QUICK_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.ANY_TOKEN, utils.parseUnits('200'), MaticAddresses.QUICK_TOKEN);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.QuickChart_TOKEN, utils.parseUnits('10'), MaticAddresses.QUICK_TOKEN);

  }

}
