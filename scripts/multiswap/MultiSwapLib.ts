import {MultiSwap2} from "../../typechain";
import * as fs from 'fs';
import {BigNumber, utils} from "ethers";
import {ethers} from "hardhat";

const MULTI_SWAP2_MATIC = '0xF5BcFFf7E063Ebd673f0e1F4f7239516300B32d8'

const BIGNUMBER0 = BigNumber.from(0);

type Pair = {
  lp: string;
  tokenIn: string;
  tokenOut: string;
  reverse: boolean; // false: change token0 to token1; true: change token1 to token0
  stepNumber: number;
  reserve0?: BigNumber;
  reserve1?: BigNumber;
}

type IndexedPair = { [key: string]: Pair }
type IndexedPairs = { [key: string]: Pair[] }


type Route = {
  steps: Pair[];
  finished: boolean;
  amountOut?: BigNumber;
}

type Step = {
  lp: string;
  reverse: boolean;
}

async function loadAllPairs(
    multiSwap2: MultiSwap2,
    factories: string[],
    bath = 1000): Promise<string[][]> {
  const pairs: string[][] = [];
  for (const factory of factories) {
    console.log('factory', factory);
    let skip = 0;
    let p
    do {
      p = await multiSwap2.loadPairsUniswapV2(factory, skip, bath)
      console.log(' skip, bath, loaded', skip, bath, p.length);
      pairs.push(...p)
      skip += p.length
    } while (p.length === bath)
  }
  return pairs;
}

async function saveObjectToJsonFile(obj: object, fileName: string) {
  const json = JSON.stringify(obj, null, ' ')
  await fs.writeFile(fileName, json, {encoding: 'utf8'}, (err) => {
    if (err) throw err
  })
}

function indexAllPairs(pairs: string[][]): IndexedPairs {
  const ways: IndexedPairs = {}

  const pushPairToWays = (pair: Pair) => {
    const token0 = pair.tokenIn
    if (!ways[token0]) {
      ways[token0] = [pair]
    } else {
      ways[token0].push(pair)
    }
  }

  for (const p of pairs) {
    const pair: Pair = {lp: p[0], tokenIn: p[1], tokenOut: p[2], reverse: false, stepNumber: 0}
    pushPairToWays(pair)
    const reversePair: Pair = {lp: p[0], tokenIn: p[2], tokenOut: p[1], reverse: true, stepNumber: 0}
    pushPairToWays(reversePair)
  }
  return ways
}

function findAllRoutes(allPairs: IndexedPairs, tokenIn: string, tokenOut: string, maxRouteLength: number): Route[] {
  console.log('findAllRoutes maxRouteLength', maxRouteLength);
  tokenIn = ethers.utils.getAddress(tokenIn)
  tokenOut = ethers.utils.getAddress(tokenOut)

  const routes: Route[] = []
  const finishedRoutes: Route[] = []
  const firstPairs = allPairs[tokenIn]

  // first step - we fill pairs with tokenIn as first step
  for (const pair of firstPairs) {
    pair.stepNumber = 1;
    const finished = pair.tokenOut === tokenOut;
    (finished ? finishedRoutes : routes).push({steps: [pair], finished})
  }

  for (let s = 1; s < maxRouteLength; s++) {
    const routesLen = routes.length
    for (let r = 0; r < routesLen; r++) {
      const route = routes[r];
      if (!route || route.finished) continue;

      const lastTokenOut = route.steps[route.steps.length - 1].tokenOut;

      const nextPairs = allPairs[lastTokenOut]
      let firstDirection = true; // directions from last way
      for (const nextPair of nextPairs) {
        if (nextPair.stepNumber !== 0) continue; // skip passed ways

        nextPair.stepNumber = s + 1
        let newRoute = route

        if (!firstDirection) {
          // copy current route if this is not first direction
          // tslint:disable-next-line:prefer-object-spread
          newRoute = {steps: route.steps.slice(0, -1), finished: false}
          routes.push(newRoute)
        }

        newRoute.steps.push(nextPair)
        newRoute.finished = nextPair.tokenOut === tokenOut
        if (newRoute.finished) {
          finishedRoutes.push(newRoute)
        }
        firstDirection = false;
      }
    }
  }
  return finishedRoutes
}

function getAllRoutes(pairs: string[][], tokenIn: string, tokenOut: string, maxRouteLength: number = 5): Route[] {
  console.time('indexAllPairs')
  const allPairs = indexAllPairs(pairs)
  console.timeEnd('indexAllPairs')
  console.log('pairs.length', pairs.length);
  console.log('keys allPairs.length', Object.keys(allPairs).length);
  return findAllRoutes(allPairs, tokenIn, tokenOut, maxRouteLength);
}

function extractPairsFromRoutes(routes: Route[]): IndexedPair {
  const pairs: IndexedPair = {}
  for (const route of routes) {
    const steps = route.steps
    for (const pair of steps) {
      pairs[pair.lp] = pair
    }
  }
  return pairs
}

async function loadPairReserves(multiSwap2: MultiSwap2, pairs: IndexedPair) {
  const addresses = Object.keys(pairs)
  const reserves = await multiSwap2.loadPairReserves(addresses)
  for (let p = 0; p < addresses.length; p++) {
    const pair: Pair = pairs[addresses[p]]
    const reserve = reserves[p]
    if (pair) {
      if (pair.reverse) {
        pair.reserve0 = reserve[1]
        pair.reserve1 = reserve[0]
      } else {
        pair.reserve0 = reserve[0]
        pair.reserve1 = reserve[1]
      }
    }
  }
}

async function loadReserves(multiSwap2: MultiSwap2, routes: Route[]) {
  const usedPairs = extractPairsFromRoutes(routes);
  const usedPairsKeys = Object.keys(usedPairs) // TODO remove
  console.log('usedPairsKeys.length', usedPairsKeys.length); // TODO remove
  await loadPairReserves(multiSwap2, usedPairs);
}

// copy from UniswapV2Library
// given an output amount of an asset and pair reserves, returns a required input amount of the other asset
/*function getAmountIn(amountOut: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber): BigNumber {
  if (!amountOut.gt(0)) return BIGNUMBER0;
  if (!(reserveIn.gt(0) && reserveOut.gt(0))) return BIGNUMBER0;
  const numerator = reserveIn.mul(amountOut).mul(1000);
  const denominator = reserveOut.sub(amountOut).mul(997);
  return numerator.div(denominator).add(1);
}*/

// copy from UniswapV2Library
// given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
function getAmountOut(amountIn: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber): BigNumber {
  if (!amountIn.gt(0)) return BIGNUMBER0;
  if (!(reserveIn.gt(0) && reserveOut.gt(0))) return BIGNUMBER0;
  const amountInWithFee = amountIn.mul(997);
  const numerator = amountInWithFee.mul(reserveOut);
  const denominator = reserveIn.mul(1000).add(amountInWithFee);
  return numerator.div(denominator);
}

function calculateRouteAmountOut(route: Route, amountIn: BigNumber): BigNumber {
  const steps = route.steps
  let amountOut = amountIn
  for (const pair of steps) {
    if (!pair.reserve0 || !pair.reserve1) return BIGNUMBER0;
    amountOut = getAmountOut(amountOut, pair.reserve0, pair.reserve1)
  }
  return amountOut
}

function calculateOutputs(routes: Route[], amountIn: BigNumber) {
  for (const route of routes) {
    route.amountOut = calculateRouteAmountOut(route, amountIn)
  }
}

/// Descending Order
function sortRoutesByOutputs(routes: Route[]) {
  routes.sort((a, b) => {
    const ao = a.amountOut ? a.amountOut : BIGNUMBER0;
    const bo = b.amountOut ? b.amountOut : BIGNUMBER0;
    if (ao.lt(bo)) return 1;
    if (ao.gt(bo)) return -1;
    return 0
  })
}

function getBestRoute(routes: Route[]): Route | null {
  let bestRoute: Route | null = null;
  let maxOutput = BIGNUMBER0;
  for (const route of routes) {
    if (route.amountOut && route.amountOut.gt(maxOutput)) {
      bestRoute = route;
      maxOutput = route.amountOut;
    }
  }
  return bestRoute
}

type RoutesData = {
  weights: number[];
  routes: Route[];
  amountOut: BigNumber;
}

function getBestRoutes(routes: Route[], amountIn: BigNumber, maxRoutes = 5): RoutesData {
  const weights: number[] = [];
  const percentStep = 5;

  let bestWeights: number[] = [];
  let bestOutput = BIGNUMBER0;
  let variantsTested = 0; // TODO remove

  const calcRoutesOutput = function(): BigNumber {
    let totalOutput = BIGNUMBER0;
    for (let routeIndex = 0; routeIndex < maxRoutes; routeIndex++) {
      const route = routes[routeIndex];
      const routeWeight = weights[routeIndex];
      const routeAmountIn = amountIn.mul(routeWeight).div(100);
      totalOutput = totalOutput.add(calculateRouteAmountOut(route, routeAmountIn));
    }
    return totalOutput
  }

  /// Recursive function to iterate all variants, splitting 0-100% to max routes
  const iterate = function(percentage: number, weightIndex: number) {
    if (weightIndex === 0) {
      weights[0] = percentage;
      const output = calcRoutesOutput();
      variantsTested ++; // TODO remove
      if (output.gt(bestOutput)) {
        bestOutput = output;
        bestWeights = [...weights];
      }
      // console.log('weights', weights, output.toString(), bestOutput.toString()); // TODO rm
    } else {
      for (let part = 0; part <= percentage; part += percentStep) {
        weights[weightIndex] = part;
        iterate(percentage - part, weightIndex - 1);
      }
    }
  }

  iterate(100, maxRoutes - 1);

  const bestRoute = getBestRoute(routes)
  const bestRouteOutput = bestRoute?.amountOut || BIGNUMBER0;

  console.log('variantsTested', variantsTested);
  console.log('amount in    ', amountIn.toString());
  console.log('route  Output', bestRouteOutput.toString());
  console.log('weight Output', bestOutput.toString());
  console.log('increase %  +', bestOutput.mul(100).div(bestRouteOutput).toNumber() - 100);
  return {
    weights: bestWeights,
    routes: routes.slice(0,weights.length),
    amountOut: bestOutput
  };
}

function encodeRouteData(routesData: RoutesData): string {
  const weights = routesData.weights;
  const filteredWeights: number[] = [];
  const filteredSteps: Step[][] = [];
  for (let i = 0; i < weights.length; i ++) {
    if (weights[i] > 0) {
      filteredWeights.push(weights[i]);
      const steps: Step[] = [];
      const route = routesData.routes[i];
      for (const pair of route.steps) {
        steps.push({lp:pair.lp, reverse:pair.reverse});
      }
      filteredSteps.push(steps)
    }
  }

  console.log('filteredSteps', filteredSteps);
  console.log('filteredWeights', filteredWeights);

  return utils.defaultAbiCoder.encode(
      ['uint[]', 'tuple(address lp, bool reverse)[][]'],
      [filteredWeights, filteredSteps]
  );
}

function findBestRoutes(allRoutes: Route[], amountIn: BigNumber): RoutesData {
  console.time('calculateOutputs')
  calculateOutputs(allRoutes, amountIn)
  console.timeEnd('calculateOutputs')

  sortRoutesByOutputs(allRoutes)

  return getBestRoutes(allRoutes, amountIn);
}

export {
  MULTI_SWAP2_MATIC,
  Pair,
  loadAllPairs,
  saveObjectToJsonFile,
  indexAllPairs,
  findAllRoutes,
  getAllRoutes,
  extractPairsFromRoutes,
  loadReserves,
  calculateOutputs,
  sortRoutesByOutputs,
  getBestRoute,
  findBestRoutes,
  encodeRouteData,
}
