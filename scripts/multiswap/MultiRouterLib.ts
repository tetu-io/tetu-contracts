import {MultiRouter} from "../../typechain";
import * as fs from 'fs';
// import pairs from 'json/MultiRouterPairs.json'

type Pair = {
  lp: string;
  tokenIn: string;
  tokenOut: string;
  reverse: boolean;
  stepNumber: number;
}


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
    const pair: Pair = {lp:p[0], tokenIn:p[1], tokenOut:p[2], reverse: false, stepNumber: 0}
    pushPairToWays(pair)
    const reversePair: Pair = {lp:p[0], tokenIn:p[2], tokenOut:p[1], reverse: true, stepNumber: 0}
    pushPairToWays(reversePair)
  }
  return ways
}

type Route = {
  steps: Pair[];
  finished: boolean;
}

function findAllRoutes(allPairs: IndexedPairs, tokenIn: string, tokenOut: string, maxRouteLength: number) {
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
    (finished ? finishedRoutes : routes).push({steps:[pair], finished})
  }
  console.log('routes', routes);
  console.log('routes.length', routes.length);

  for (let s = 1; s < maxRouteLength; s++) {
    for (const route of routes) {
      if (route.finished) continue;

      const lastTokenOut = route.steps[route.steps.length-1].tokenOut;

      const nextPairs = allPairs[lastTokenOut]
      let directions = 0; // directions from last way
      for (const nextPair of nextPairs) {
        if (nextPair.stepNumber !== 0) continue; // skip passed ways

        nextPair.stepNumber = s + 1
        let r = route

        if (directions !== 0) {
          // copy current route if this is not first direction
          // tslint:disable-next-line:prefer-object-spread
          r = {steps: Object.assign([], r.steps), finished: false}
          routes.push(r)
        }

        r.steps.push(nextPair)
        r.finished = nextPair.tokenOut === tokenOut
        if (r.finished) finishedRoutes.push(r)
        directions++;
      }
    }
  }

  return finishedRoutes
}

/*

  function findAllRoutes(Way[] memory ways, address tokenIn, address tokenOut, uint8 maxRoutes, uint8 maxRouteLength)
  public view returns (uint32[][] memory _routes) {
    bool[] memory finished = new bool[](maxRoutes);
    uint32[][] memory routes = new uint32[][](maxRoutes);

    for (uint8 r = 0; r < maxRoutes; r++) {
      routes[r]  = new uint32[](maxRouteLength);
    }

    uint8 routesCount = 0;
    uint8 finishedRoutes = 0;

    // first step - we fill ways with tokenIn
    for (uint8 w = 0; w < ways.length; w++) {
      Way memory way = ways[w];
      if (way.tokenIn == tokenIn) {
        way.stepNumber = 1;
        routes[routesCount][0] = w;
        if (way.tokenOut == tokenOut) {
          finished[routesCount] = true;
          finishedRoutes++;
        }
        routesCount++;
      }
    }

    { // stack to deep
    for (uint8 s = 1; s < maxRouteLength; s++) {
      for (uint8 r = 0; r < routesCount; r++) {
        if (finished[r]) continue;

        address lastWayTokenOut = ways[routes[r][s]].tokenOut;

        uint8 directions = 0; // directions from last way
        for (uint8 w = 0; w < ways.length; w++) {
          Way memory newWay = ways[w];
          if (newWay.stepNumber != 0) continue; // skip passed ways
          if (lastWayTokenOut == newWay.tokenIn) {
            newWay.stepNumber = s + 1;
            uint32 routeIndex = r;
            bool routeFinished = newWay.tokenOut == tokenOut;

            if (directions != 0) {
              if (routesCount>=maxRoutes) continue;
              // copy current route
              for (uint8 i = 0; i < s; i++) {
                routes[routesCount][i] = routes[r][i];
              }
              routeIndex = routesCount;
              routesCount++;
            }

            routes[routeIndex][s + 1] = w;
            finished[routeIndex] = routeFinished;
            if (routeFinished) finishedRoutes++;
            directions++;
          }
        }
      }
    }
    }

    // copy finished routes to _routes return variable
    _routes = new uint32[][](finishedRoutes);
    uint8 f = 0;
    for (uint8 r = 0; r < routesCount; r++) {
      if (finished[r]) _routes[f++] = routes[r];
    }

    // print
    for (uint8 r = 0; r < _routes.length; r++) {
      console.log('Route', r);
      uint32[] memory
      route = _routes[r];
      for (uint8 w = 0; w < route.length; w++) {
        printWay(ways[route[w]]);
      }
    }
  }

  function printWay(Way memory way)
  private view {
    string memory tIn = IERC20Name(way.tokenIn).symbol();
    string memory tOut = IERC20Name(way.tokenIn).symbol();
    console.log(way.stepNumber, tIn, tOut);
  }
*/

export { Pair, loadAllPairs, saveObjectToJsonFile, indexAllPairs, findAllRoutes }
