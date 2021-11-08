import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {
  IUniswapV2Factory,
  IUniswapV2Pair,
  MultiSwap,
  PriceCalculator,
  TetuSwapFactory,
  TetuSwapPair,
  TetuSwapRouter
} from "../../typechain";
import {TokenUtils} from "../../test/TokenUtils";
import {BigNumber, utils} from "ethers";
import {MaticAddresses} from "../../test/MaticAddresses";
import {RunHelper} from "./RunHelper";
import {UniswapUtils} from "../../test/UniswapUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const MIN_AMOUNT_TO_REBALANCE = 100;

const TOKENS = [
  MaticAddresses.TETU_TOKEN,
  MaticAddresses.USDC_TOKEN,
  MaticAddresses.USDT_TOKEN,
  MaticAddresses.WBTC_TOKEN,
  MaticAddresses.WETH_TOKEN,
  MaticAddresses.WMATIC_TOKEN,
];


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const calculator = await DeployerUtils.connectProxy(tools.calculator, signer, "PriceCalculator") as PriceCalculator;
  const factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', core.swapFactory) as TetuSwapFactory;
  const router = await DeployerUtils.connectInterface(signer, 'TetuSwapRouter', core.swapRouter) as TetuSwapRouter;

  const lpCount = (await factory.allPairsLength()).toNumber();

  while (true) {


    for (let i = 0; i < lpCount; i++) {
      try {
        console.log('-----------------------------');
        const quickFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', MaticAddresses.QUICK_FACTORY) as IUniswapV2Factory;

        const lp = await factory.allPairs(i);
        const lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;

        const token0 = await lpCtr.token0();
        const token1 = await lpCtr.token1();

        const tokenName0 = await TokenUtils.tokenSymbol(token0);
        const tokenName1 = await TokenUtils.tokenSymbol(token1);
        console.log('--', tokenName0, tokenName1);

        const tokenDec0 = await TokenUtils.decimals(token0);
        const tokenDec1 = await TokenUtils.decimals(token1);

        let tokenBal0 = +utils.formatUnits(await TokenUtils.balanceOf(token0, signer.address), tokenDec0);
        let tokenBal1 = +utils.formatUnits(await TokenUtils.balanceOf(token1, signer.address), tokenDec1);

        const reserves = await lpCtr.getReserves();
        const reserve0 = +utils.formatUnits(reserves[0], tokenDec0);
        const reserve1 = +utils.formatUnits(reserves[1], tokenDec1);

        let qsReserve0: number;
        let qsReserve1: number;
        try {
          const quickPair = await quickFactory.getPair(token0, token1);
          const quickPairCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', quickPair) as IUniswapV2Pair;
          const qsReserves = await quickPairCtr.getReserves();
          qsReserve0 = +utils.formatUnits(qsReserves[0], tokenDec0);
          qsReserve1 = +utils.formatUnits(qsReserves[1], tokenDec1);
        } catch (e) {
          console.log('pair not exist on qs')
          continue;
        }

        const targetPrice0 = qsReserve1 / qsReserve0;
        const targetPrice1 = qsReserve0 / qsReserve1;
        const token0SwapAmount = calculate(reserve0, reserve1, targetPrice0);
        let toSwap: BigNumber;

        let path: string[];
        if (token0SwapAmount > 0) {
          const price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(token0));
          path = [token0, token1];
          toSwap = utils.parseUnits(token0SwapAmount.toFixed(tokenDec0), tokenDec0);
          if (token0SwapAmount * price < MIN_AMOUNT_TO_REBALANCE) {
            console.log('skip low amount 0', tokenName0, tokenName1, token0SwapAmount * price);
            continue;
          }
          await buyToken(signer, token0, calculator, tools.multiSwap, token0SwapAmount * price);
          tokenBal0 = +utils.formatUnits(await TokenUtils.balanceOf(token0, signer.address), tokenDec0);
          if (token0SwapAmount > tokenBal0) {
            console.log('TOO LOW AMOUNT ' + tokenName0, token0SwapAmount, tokenBal0)
            continue;
          }
          console.log('==> SWAP amount 0 ' + tokenName0, token0SwapAmount, token0SwapAmount * price);
          const allowance = +utils.formatUnits(await TokenUtils.allowance(token0, signer, router.address), tokenDec0);
          if (allowance < token0SwapAmount) {
            console.log('approve 0');
            await TokenUtils.approve(token0, signer, router.address, utils.parseUnits('10000000000', tokenDec0).toString());
          }
        } else {
          const price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(token1));
          const token1SwapAmount = calculate(reserve1, reserve0, targetPrice1);

          path = [token1, token0];
          toSwap = utils.parseUnits(token1SwapAmount.toFixed(tokenDec1), tokenDec1);
          if (token1SwapAmount * price < MIN_AMOUNT_TO_REBALANCE) {
            console.log('skip low amount 1', tokenName0, tokenName1, token1SwapAmount * price);
            continue;
          }
          await buyToken(signer, token1, calculator, tools.multiSwap, token1SwapAmount * price);
          tokenBal1 = +utils.formatUnits(await TokenUtils.balanceOf(token1, signer.address), tokenDec1);
          if (token1SwapAmount > tokenBal1) {
            console.log('TOO LOW AMOUNT ' + tokenName1, token1SwapAmount, tokenBal1)
            continue;
          }
          console.log('==> SWAP amount 1 ' + tokenName1, token1SwapAmount, token1SwapAmount * price);

          const allowance = +utils.formatUnits(await TokenUtils.allowance(token1, signer, router.address), tokenDec1);
          if (allowance < token1SwapAmount) {
            console.log('approve 1');
            await TokenUtils.approve(token1, signer, router.address, utils.parseUnits('10000000000', tokenDec1).toString());
          }
        }
        console.log('BALANCE ' + tokenName0, tokenBal0);
        console.log('BALANCE ' + tokenName1, tokenBal1);
        console.log('reserve0 ' + tokenName0, reserve0);
        console.log('reserve1 ' + tokenName1, reserve1);
        console.log('current price ' + tokenName0, (reserve1 / reserve0));
        console.log('current price ' + tokenName1, (reserve0 / reserve1));
        console.log('targetPrice0', targetPrice0);
        console.log('targetPrice1', targetPrice1);
        // continue;
        try {
          await RunHelper.runAndWait(() => lpCtr.sync());
          await RunHelper.runAndWait(() => router.swapExactTokensForTokens(
            toSwap,
            BigNumber.from("0"),
            path,
            signer.address,
            UniswapUtils.deadline
          ));
        } catch (e) {
          console.log('Error', e);
        }


        console.log('-----------------------------');
      } catch (e) {
        console.log('Loop Error', e);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


function calculate(
  tokenReserve: number,
  oppReserve: number,
  targetPrice: number
) {
  const result = Math.sqrt(tokenReserve * oppReserve / targetPrice) - tokenReserve;
  return result - (result * 0.0001);
}

async function buyToken(signer: SignerWithAddress, tokenToBuy: string, calculator: PriceCalculator, multiswapAdr: string, toBuyAmountUSD: number) {
  const tokenToBuyName = await TokenUtils.tokenSymbol(tokenToBuy);
  const tokenToBuyDec = await TokenUtils.decimals(tokenToBuy);
  const tokenToBuyPrice = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(tokenToBuy));

  const tokenToBuyBalance = +utils.formatUnits(await TokenUtils.balanceOf(tokenToBuy, signer.address), tokenToBuyDec);

  const multiswap = await DeployerUtils.connectInterface(signer, 'MultiSwap', multiswapAdr) as MultiSwap;

  const data = await findMaxBalance(signer, calculator, tokenToBuy);
  const tokenToSell = data[0];
  const maxBal = data[1];
  const tokenToSellDec = await TokenUtils.decimals(tokenToSell as string);
  const tokenToSellPrice = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(tokenToSell as string));
  const tokenToSellName = await TokenUtils.tokenSymbol(tokenToSell as string);

  const toSell = (toBuyAmountUSD * 1.1) / tokenToSellPrice;
  console.log('-----------------------------');
  console.log('TO BUY', tokenToBuyName);
  console.log('toBuyAmountUSD', toBuyAmountUSD);
  console.log('tokenToBuyBalance', tokenToBuyBalance);
  console.log('to buy token balance usd', tokenToBuyBalance * tokenToBuyPrice);
  console.log('TO SELL', tokenToSellName);
  console.log('to sell amount', toSell);
  console.log('-----------------------------');

  if (toBuyAmountUSD > maxBal) {
    console.log('NOT ENOUGH BALANCE FOR REFUEL', tokenToBuyName, tokenToSellName, toSell, maxBal);
    return;
  }

  let lps: string[];
  // const lps: string[] = [await quickFactory.getPair(targetToken, token)];
  if ((MaticAddresses.TETU_TOKEN === tokenToSell.toLowerCase() && MaticAddresses.USDC_TOKEN === tokenToBuy.toLowerCase())
    || (MaticAddresses.USDC_TOKEN === tokenToSell.toLowerCase() && MaticAddresses.TETU_TOKEN === tokenToBuy.toLowerCase())) {
    lps = [MaticAddresses.QUICK_TETU_USDC];
  } else if ((MaticAddresses.TETU_TOKEN === tokenToSell.toLowerCase() && MaticAddresses.WMATIC_TOKEN === tokenToBuy.toLowerCase())) {
    lps = [MaticAddresses.QUICK_TETU_USDC, MaticAddresses.QUICK_WMATIC_USDC];
  } else if ((MaticAddresses.TETU_TOKEN === tokenToSell.toLowerCase() && MaticAddresses.WETH_TOKEN === tokenToBuy.toLowerCase())) {
    lps = [MaticAddresses.QUICK_TETU_USDC, MaticAddresses.QUICK_USDC_WETH];
  } else {
    lps = await multiswap.findLpsForSwaps(tokenToSell as string, tokenToBuy);
  }
  console.log('lps for refuel', lps);

  const allowance = +utils.formatUnits(await TokenUtils.allowance(tokenToSell as string, signer, multiswapAdr), tokenToSellDec);
  if (allowance < toSell) {
    console.log('approve');
    await TokenUtils.approve(tokenToSell as string, signer, multiswapAdr, utils.parseUnits('10000000000', tokenToSellDec).toString());
  }

  await RunHelper.runAndWait(() => multiswap.multiSwap(
    lps,
    tokenToSell,
    tokenToBuy,
    utils.parseUnits(toSell.toFixed(tokenToSellDec), tokenToSellDec),
    5
  ));

}

async function findMaxBalance(signer: SignerWithAddress, calculator: PriceCalculator, exclude: string): Promise<[string, number]> {
  let maxBal = 0;
  let maxToken = MaticAddresses.ZERO_ADDRESS;
  for (const token of TOKENS) {
    if (exclude.toLowerCase() === token.toLowerCase()) {
      continue;
    }
    const tokenDec = await TokenUtils.decimals(token);
    const price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(token));
    const bal = +utils.formatUnits(await TokenUtils.balanceOf(token, signer.address), tokenDec);
    const balUsd = bal * price;
    if (maxBal < balUsd) {
      maxBal = balUsd;
      maxToken = token;
    }
  }
  return [maxToken, maxBal];
}
