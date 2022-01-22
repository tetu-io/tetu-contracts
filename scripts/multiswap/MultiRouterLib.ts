import {MultiRouter} from "../../typechain";
import * as fs from 'fs';
import {BigNumber} from "ethers";
// import pairs from 'json/MultiRouterPairs.json'

const MULTI_ROUTER_MATIC = '0x6dB6CeA8BB997525164a8960d74143685b0a00F7'

type Pair = {
  lp: string;
  tokenIn: string;
  tokenOut: string;
  reverse: boolean;
  stepNumber: number;
  reserve0?: BigNumber;
  reserve1?: BigNumber;
}

type IndexedPair = { [key: string]: Pair }
type IndexedPairs = { [key: string]: Pair[] }

async function loadAllPairs(
    multiRouter: MultiRouter,
    factories: string[],
    bath = 1000): Promise<string[][]> {
  const pairs: string[][] = [];
  for (const factory of factories) {
    console.log('factory', factory);
    let skip = 0;
    let p
    do {
      p = await multiRouter.loadPairsUniswapV2(factory, skip, bath)
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
    p[0] = p[0].toLowerCase()
    p[1] = p[1].toLowerCase()
    p[2] = p[2].toLowerCase()
    const pair: Pair = {lp: p[0], tokenIn: p[1], tokenOut: p[2], reverse: false, stepNumber: 0}
    pushPairToWays(pair)
    const reversePair: Pair = {lp: p[0], tokenIn: p[2], tokenOut: p[1], reverse: true, stepNumber: 0}
    pushPairToWays(reversePair)
  }
  return ways
}

type Route = {
  steps: Pair[];
  finished: boolean;
}

function findAllRoutes(allPairs: IndexedPairs, tokenIn: string, tokenOut: string, maxRouteLength: number): Route[] {
  console.log('findAllRoutes maxRouteLength', maxRouteLength);
  tokenIn = tokenIn.toLowerCase()
  tokenOut = tokenOut.toLowerCase()

  console.log('tokenIn', tokenIn);
  const routes: Route[] = []
  const finishedRoutes: Route[] = []
  const firstPairs = allPairs[tokenIn]

  // first step - we fill pairs with tokenIn
  for (const pair of firstPairs) {
    pair.stepNumber = 1;
    const finished = pair.tokenOut === tokenOut;
    (finished ? finishedRoutes : routes).push({steps: [pair], finished})
  }
  console.log('routes', routes);
  console.log('routes.length', routes.length);

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


// function loadPairReserves(address[] memory pairs)
// external view returns (ReservesData[] memory data) {
async function loadPairReserves(multiRouter: MultiRouter, pairs: IndexedPair) {
  const addresses = Object.keys(pairs)
  const reserves = await multiRouter.loadPairReserves(addresses)
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

export {
  MULTI_ROUTER_MATIC,
  Pair,
  loadAllPairs,
  saveObjectToJsonFile,
  indexAllPairs,
  findAllRoutes,
  extractPairsFromRoutes,
  loadPairReserves
}
