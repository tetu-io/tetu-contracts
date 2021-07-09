import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {IUniswapV2Pair, LiquidityBalancer} from "../../typechain";
import {Erc20Utils} from "../../test/Erc20Utils";
import {utils} from "ethers";
import {RunHelper} from "./RunHelper";
import {RopstenAddresses} from "../../test/RopstenAddresses";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const net = (await ethers.provider.getNetwork()).name;
  const balancer = await DeployerUtils.connectContract(signer, 'LiquidityBalancer', tools.rebalancer) as LiquidityBalancer;
  // await RunHelper.runAndWait(() => balancer.salvage(core.rewardToken));
  // return;
  const targetToken = core.rewardToken;
  const targetPrice = 1;
  const targetTvl = 1000_000;
  const targetLpAddress = (await DeployerUtils.getMockAddresses()).get('sushi_lp_token_usdc') as string;
  const targetLp = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', targetLpAddress) as IUniswapV2Pair;
  const token0 = await targetLp.token0();
  const token1 = await targetLp.token1();
  const token0Decimals = await Erc20Utils.decimals(token0);
  const token1Decimals = await Erc20Utils.decimals(token1);

  if (+utils.formatUnits(await balancer.priceTargets(targetToken)) === 0) {
    await balancer.setTargetPrice(targetToken, utils.parseUnits(targetPrice + ''));
  }
  if (+utils.formatUnits(await balancer.lpTvlTargets(targetLpAddress)) === 0) {
    await balancer.setTargetLpTvl(targetLpAddress, utils.parseUnits(targetTvl + ''));
  }

  let router;
  if (net === 'ropsten') {
    router = RopstenAddresses.SUSHI_ROUTER;
  } else {
    throw Error('Unknown net ' + net);
  }

  await balancer.setRouter(targetLpAddress, router);

  let lastPrice;
  let lastTvl;
  // noinspection InfiniteLoopJS
  while (true) {
    const lpData = await computePrice(
        targetLp,
        targetToken,
        token0,
        token0Decimals,
        token1Decimals
    );
    const price = lpData[0];
    const tvl = lpData[1] * 2;
    const lpTokenReserve = lpData[2];
    const balancerTokenBal = +utils.formatUnits(await Erc20Utils.balanceOf(targetToken, balancer.address));
    const balancerLpBal = +utils.formatUnits(await Erc20Utils.balanceOf(targetLpAddress, balancer.address));
    const currentPriceTarget = +utils.formatUnits(await balancer.priceTargets(targetToken));
    const currentTvlTarget = +utils.formatUnits(await balancer.lpTvlTargets(targetLpAddress));

    if (!lastPrice) {
      lastPrice = price;
    }
    if (!lastTvl) {
      lastTvl = tvl;
    }

    const needToSell = utils.formatUnits(await balancer.needToSell(targetToken, targetLpAddress));
    console.log('needToSell', needToSell);
    const needToRemove = utils.formatUnits(await balancer.needToRemove(targetToken, targetLpAddress));
    console.log('needToRemove', needToRemove);

    console.log(
        '######################### CURRENT STATS ##############################\n' +
        '# Price:                    ' + price + ' (' + ((price - lastPrice) / price * 100) + '%)\n' +
        '# LP TVL:                   ' + tvl + ' (' + ((tvl - lastTvl) / tvl * 100) + '%)\n' +
        '# LP Token Reserve:         ' + lpTokenReserve + '\n' +
        '# Balancer Tokens:          ' + balancerTokenBal + '\n' +
        '# Balancer LP Tokens:       ' + balancerLpBal + '\n' +
        '# Price Target:             ' + currentPriceTarget + '\n' +
        '# TVL Target:               ' + currentTvlTarget + '\n' +
        '# Sell:                     ' + needToSell + '\n' +
        '# Remove:                   ' + needToRemove + '\n' +
        '######################################################################'
    );
    lastPrice = price;
    lastTvl = tvl;

    if (balancerTokenBal === 0 && balancerLpBal === 0) {
      console.log('zero balance');
      continue;
    }

    if (needToSell === '0.0' && needToRemove === '0.0') {
      console.log('nothing to do');
      continue;
    }

    await RunHelper.runAndWait(() =>
            balancer.changeLiquidity(targetToken, targetLpAddress),
        true);

  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});


async function computePrice(
    lp: IUniswapV2Pair,
    targetToken: string,
    token0: string,
    token0Decimals: number,
    token1Decimals: number
): Promise<[number, number, number]> {
  const reserves = await lp.getReserves();
  const reserve0 = +utils.formatUnits(reserves[0], token0Decimals);
  const reserve1 = +utils.formatUnits(reserves[1], token1Decimals);

  if (token0.toLowerCase() === targetToken.toLowerCase()) {
    return [reserve1 / reserve0, reserve1, reserve0];
  } else {
    return [reserve0 / reserve1, reserve0, reserve1];
  }
}

// ignore swap tax for more clear computation
function computeAmountToSell(reserveToken: number, reserveOpposite: number, targetPrice: number): number {
  if (targetPrice === 0) {
    return 0;
  }
  const expectTokenReserve = reserveOpposite / targetPrice;
  // console.log(
  //     'reserveToken', reserveToken,
  //     'reserveOpposite', reserveOpposite,
  //     'targetPrice', targetPrice,
  //     'expectTokenReserve', expectTokenReserve
  // );
  return Math.max(expectTokenReserve - reserveToken, 0);
}

function computeAmountToRem(totalSupply: number, reserveOpposite: number, targetTvl: number): number {
  if (targetTvl === 0) {
    return 0;
  }
  const rate = ((reserveOpposite * 2) - targetTvl) / targetTvl;
  return Math.max(totalSupply * rate, 0);
}
