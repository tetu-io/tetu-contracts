import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {IUniswapV2Pair, LiquidityBalancer} from "../../typechain";
import {utils} from "ethers";
import {RopstenAddresses} from "../../test/RopstenAddresses";
import {Settings} from "../../settings";
import {MaticAddresses} from "../../test/MaticAddresses";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const net = (await ethers.provider.getNetwork()).name;
  const balancer = await DeployerUtils.connectContract(signer, 'LiquidityBalancer', tools.rebalancer) as LiquidityBalancer;
  const targetToken = core.rewardToken;
  const targetPrice = Settings.lbTargetPrice;
  const targetTvl = Settings.lbTargetTvl;
  const targetLpAddress = (await DeployerUtils.getTokenAddresses()).get('sushi_lp_token_usdc') as string;

  if (+utils.formatUnits(await balancer.priceTargets(targetToken)) === 0) {
    await balancer.setTargetPrice(targetToken, utils.parseUnits(targetPrice + ''));
  }
  if (+utils.formatUnits(await balancer.lpTvlTargets(targetLpAddress)) === 0) {
    await balancer.setTargetLpTvl(targetLpAddress, utils.parseUnits(targetTvl + ''));
  }

  let router;
  if (net === 'ropsten' || net === 'rinkeby') {
    router = RopstenAddresses.SUSHI_ROUTER;
  } else if (net === 'matic') {
    router = MaticAddresses.SUSHI_ROUTER;
  } else {
    throw Error('Unknown net ' + net);
  }

  await balancer.setRouter(targetLpAddress, router);


}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
