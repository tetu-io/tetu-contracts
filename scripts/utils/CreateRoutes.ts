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

  const routes = [];
  const routers = [];
  const paths = new Set<string>();
  let i = 0;
  while (i < vaultsSize) {
    try {
      const vAdr = await bookkeeper._vaults(i);
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
        if (MaticAddresses.TETU_TOKEN !== rt.toLowerCase()) {
          const tetuRoute = await StrategyTestUtils.createLiquidationPath(rt, MaticAddresses.TETU_TOKEN, calculator);
          if (addToPaths(paths, tetuRoute[0])) {
            routes.push(tetuRoute[0]);
            routers.push(tetuRoute[1]);
          }

        }
        if (MaticAddresses.USDC_TOKEN !== rt.toLowerCase()) {
          const fundRoute = await StrategyTestUtils.createLiquidationPath(rt, MaticAddresses.USDC_TOKEN, calculator);
          if (addToPaths(paths, fundRoute[0])) {
            routes.push(fundRoute[0]);
            routers.push(fundRoute[1]);
          }
        }
        if (!ASSET_SPECIFIC_ROUTES.includes(platform)) {
          const assets = await cReader.strategyAssets(strategy);
          for (const asset of assets) {
            if (asset.toLowerCase() === rt.toLowerCase()) {
              console.log('the same as rt', asset)
              continue;
            }
            if (EXCLUDED_ASSETS.includes(asset.toLowerCase())) {
              console.log('excluded asses', asset)
              continue;
            }
            const assetRoute = await StrategyTestUtils.createLiquidationPath(rt, asset, calculator);
            if (addToPaths(paths, assetRoute[0])) {
              routes.push(assetRoute[0]);
              routers.push(assetRoute[1]);
            }
          }
        }
      }
      i++;
    } catch (e) {
      console.error('Error in loop', e);
    }
  }

  const txt = routes.toString() + '\n\n-----------------\n\n' + routers.toString();
  writeFileSync(`./tmp/routes.txt`, txt, 'utf8');
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

function addToPaths(paths: Set<string>, routes: string[]) {
  let routeStr = '';
  for (const route of routes) {
    routeStr += route.toLowerCase();
  }
  if (paths.has(routeStr)) {
    console.log('Route already exist')
    return false;
  } else {
    paths.add(routeStr);
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

