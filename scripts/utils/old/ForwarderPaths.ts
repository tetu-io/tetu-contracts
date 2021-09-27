import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {FeeRewardForwarder} from "../../../typechain";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {RopstenAddresses} from "../../../test/RopstenAddresses";
import {RunHelper} from "../RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const net = (await ethers.provider.getNetwork()).name;
  const mocks = await DeployerUtils.getTokenAddresses();

  const forwarder = await DeployerUtils.connectContract(signer,
      'FeeRewardForwarder', core.feeRewardForwarder) as FeeRewardForwarder;

  const [sushiRoute, sushiRouters] = sushiRoutes(net, mocks, core.rewardToken);
  await RunHelper.runAndWait(() => forwarder.setConversionPath(sushiRoute, sushiRouters));
  console.log('route set', sushiRoute);

  const [sushiRouteFund, sushiRoutersFund] = sushiRoutesFund(net, mocks);
  await RunHelper.runAndWait(() => forwarder.setConversionPath(sushiRouteFund, sushiRoutersFund));
  console.log('route set', sushiRouteFund);

  const [quickRoute, quickRouters] = quickRoutes(net, mocks, core.rewardToken);
  await RunHelper.runAndWait(() => forwarder.setConversionPath(quickRoute, quickRouters));
  console.log('route set', quickRoute);

  const [quickRouteFund, quickRoutersFund] = quickRoutesFund(net, mocks);
  await RunHelper.runAndWait(() => forwarder.setConversionPath(quickRouteFund, quickRoutersFund));
  console.log('route set', quickRouteFund);

  if (net === 'matic') {

    const [waultRoute, waultRouters] = waultRoutes(net, mocks, core.rewardToken);
    await RunHelper.runAndWait(() => forwarder.setConversionPath(waultRoute, waultRouters));
    console.log('route set', waultRoute);

    const [waultRouteFund, waultRoutersFund] = waultRoutesFund(net, mocks);
    await RunHelper.runAndWait(() => forwarder.setConversionPath(waultRouteFund, waultRoutersFund));
    console.log('route set', waultRouteFund);

  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

function sushiRoutes(net: string, mocks: Map<string, string>, rewardToken: string): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.SUSHI_TOKEN, MaticAddresses.USDC_TOKEN, rewardToken];
    routers = [MaticAddresses.SUSHI_ROUTER, MaticAddresses.SUSHI_ROUTER];
  } else if (net === 'rinkeby' || net === 'ropsten') {
    route = [mocks.get('sushi') as string, mocks.get('usdc') as string, rewardToken];
    routers = [RopstenAddresses.SUSHI_ROUTER, RopstenAddresses.SUSHI_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}

function sushiRoutesFund(net: string, mocks: Map<string, string>): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.SUSHI_TOKEN, MaticAddresses.USDC_TOKEN];
    routers = [MaticAddresses.SUSHI_ROUTER];
  } else if (net === 'rinkeby' || net === 'ropsten') {
    route = [mocks.get('sushi') as string, mocks.get('usdc') as string];
    routers = [RopstenAddresses.SUSHI_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}

function quickRoutes(net: string, mocks: Map<string, string>, rewardToken: string): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.QUICK_TOKEN, MaticAddresses.USDC_TOKEN, rewardToken];
    routers = [MaticAddresses.QUICK_ROUTER, MaticAddresses.SUSHI_ROUTER];
  } else if (net === 'rinkeby' || net === 'ropsten') {
    route = [mocks.get('quick') as string, mocks.get('usdc') as string, rewardToken];
    routers = [RopstenAddresses.SUSHI_ROUTER, RopstenAddresses.SUSHI_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}

function quickRoutesFund(net: string, mocks: Map<string, string>): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.QUICK_TOKEN, MaticAddresses.USDC_TOKEN];
    routers = [MaticAddresses.QUICK_ROUTER];
  } else if (net === 'rinkeby' || net === 'ropsten') {
    route = [mocks.get('quick') as string, mocks.get('usdc') as string];
    routers = [RopstenAddresses.SUSHI_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}

function waultRoutes(net: string, mocks: Map<string, string>, rewardToken: string): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.WEXpoly_TOKEN, MaticAddresses.USDC_TOKEN, rewardToken];
    routers = [MaticAddresses.WAULT_ROUTER, MaticAddresses.SUSHI_ROUTER];
  } else if (net === 'rinkeby' || net === 'ropsten') {
    route = [mocks.get('quick') as string, mocks.get('usdc') as string, rewardToken];
    routers = [RopstenAddresses.SUSHI_ROUTER, RopstenAddresses.SUSHI_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}

function waultRoutesFund(net: string, mocks: Map<string, string>): [string[], string[]] {
  let route: string[];
  let routers: string[];
  if (net === 'matic') {
    route = [MaticAddresses.WEXpoly_TOKEN, MaticAddresses.USDC_TOKEN];
    routers = [MaticAddresses.WAULT_ROUTER];
  } else {
    throw Error('unknown net ' + net);
  }
  return [route, routers];
}
