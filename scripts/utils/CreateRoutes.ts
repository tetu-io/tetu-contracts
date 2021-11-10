import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, PriceCalculator, SmartVault} from "../../typechain";
import {writeFileSync} from "fs";
import {StrategyTestUtils} from "../../test/strategies/StrategyTestUtils";
import {MaticAddresses} from "../../test/MaticAddresses";

const ASSET_SPECIFIC_ROUTES = [7];
const EXCLUDED_ASSETS = [MaticAddresses.FRAX_TOKEN, MaticAddresses.FXS_TOKEN];

async function main() {
  const signer = (await ethers.getSigners())[1];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;
  const cReader = await DeployerUtils.connectInterface(signer, "ContractReader", tools.reader) as ContractReader;

  const vaultsSize = (await bookkeeper.vaultsLength()).toNumber();

  console.log('vaults', vaultsSize);

  const allRoutes = [];
  const allRouters = [];
  const paths = new Set<string>();
  const parsedAssets = new Set<string>();
  let i = 0;
  while (i < vaultsSize) {
    try {
      const vAdr = await bookkeeper._vaults(i);
      // const vAdr = '0x96aFb62d057f7E0Dca987C503812b12BEE14f5E5';
      // i = vaultsSize - 1;
      console.log('vAdr', i, vAdr);
      const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vAdr) as SmartVault;
      const strategy = await vCtr.strategy();
      console.log('strategy', strategy);

      const platform = (await cReader.strategyPlatform(strategy));
      console.log('platform', platform);
      if ([0, 1].includes(platform)) {
        i++;
        continue;
      }

      const rts = await cReader.strategyRewardTokens(strategy);
      console.log('rts', rts);

      for (const rt of rts) {
        if (rt.toLowerCase() === core.psVault.toLowerCase()) {
          console.log('ps reward')
          continue;
        }
        if (MaticAddresses.TETU_TOKEN !== rt.toLowerCase()) {
          if (addToAssets(parsedAssets, rt, MaticAddresses.TETU_TOKEN)) {
            const tetuRoute = await StrategyTestUtils.createLiquidationPath(rt, MaticAddresses.TETU_TOKEN, calculator);
            if (addToPaths(paths, tetuRoute[0])) {
              allRoutes.push(tetuRoute[0]);
              allRouters.push(tetuRoute[1]);
            }
          }
        }
        if (MaticAddresses.USDC_TOKEN !== rt.toLowerCase()) {
          if (addToAssets(parsedAssets, rt, MaticAddresses.USDC_TOKEN)) {
            const fundRoute = await StrategyTestUtils.createLiquidationPath(rt, MaticAddresses.USDC_TOKEN, calculator);
            if (addToPaths(paths, fundRoute[0])) {
              allRoutes.push(fundRoute[0]);
              allRouters.push(fundRoute[1]);
            }
          }
        }
        if (!ASSET_SPECIFIC_ROUTES.includes(platform)) {
          const assets = await cReader.strategyAssets(strategy);
          for (const asset of assets) {
            if (asset.toLowerCase() === rt.toLowerCase()) {
              console.log('the same as rt', asset)
              continue;
            }
            if (asset.toLowerCase() === core.psVault.toLowerCase()) {
              console.log('ps asset')
              continue;
            }
            if (EXCLUDED_ASSETS.includes(asset.toLowerCase())) {
              console.log('excluded asses', asset)
              continue;
            }
            if (addToAssets(parsedAssets, rt, asset)) {
              const assetRoute = await StrategyTestUtils.createLiquidationPath(rt, asset, calculator);
              if (addToPaths(paths, assetRoute[0])) {
                allRoutes.push(assetRoute[0]);
                allRouters.push(assetRoute[1]);
              }
            }
          }
        }
      }
      i++;
    } catch (e) {
      console.error('Error in loop', e);
    }
  }

  let routesTxt = '[\n';
  let routersTxt = '[\n';

  for (const r of allRoutes) {
    routesTxt += JSON.stringify(r) + ',\n';
  }
  routesTxt = routesTxt.slice(0, -2);

  for (const r of allRouters) {
    routersTxt += JSON.stringify(r) + ',\n';
  }
  routersTxt = routersTxt.slice(0, -2);

  routesTxt += '\n]';
  routersTxt += '\n]';

  const txt = routesTxt + '\n\n-----------------\n\n' + routersTxt;
  writeFileSync(`./tmp/routes.txt`, txt, 'utf8');
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

function addToPaths(paths: Set<string>, routes: string[]): boolean {
  let routeStr = '';
  for (const route of routes) {
    routeStr += route.toLowerCase();
  }
  if (paths.has(routeStr)) {
    console.log('Route already exist')
    return false;
  } else {
    paths.add(routeStr);
    return true;
  }
}

function addToAssets(paths: Set<string>, tokenIn: string, tokenOut: string): boolean {
  const str = tokenIn.toLowerCase() + tokenOut.toLowerCase();
  if (paths.has(str)) {
    console.log('assets already exist')
    return false;
  } else {
    paths.add(str);
    return true;
  }
}

// async function printRoute(path: string[][]) {
//   const route = path[0];
//   const routers = path[1];
//   let routeStr = '';
//   let routersStr = '';
//   for (const token of route) {
//     const symbol = await TokenUtils.tokenSymbol(token);
//     routeStr += symbol + '=>'
//   }
//   for (const router of routers) {
//     const name = MaticAddresses.getRouterName(router);
//     routersStr += name + '=>'
//   }
//   console.log('PATH ', routeStr);
//   console.log('PATH ', routersStr);
// }

