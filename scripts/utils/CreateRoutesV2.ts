import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {
  Bookkeeper,
  ContractReader,
  IUniswapV2Pair,
  PriceCalculator,
  SmartVault
} from "../../typechain";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../test/MaticAddresses";
import {TokenUtils} from "../../test/TokenUtils";
import {utils} from "ethers";

async function main() {
  const net = (await ethers.provider.getNetwork()).chainId;
  mkdir('./tmp/routes/' + net, {recursive: true}, (err) => {
    if (err) throw err;
  });
  const signer = (await ethers.getSigners())[1];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;
  const cReader = await DeployerUtils.connectInterface(signer, "ContractReader", tools.reader) as ContractReader;

  const blueChipsLps: string[] = [];
  const parsedBC = new Set<string>();

  // * parse blue chips
  for (const token of Array.from(MaticAddresses.BLUE_CHIPS.keys())) {
    for (const expectedToken of Array.from(MaticAddresses.BLUE_CHIPS.keys())) {
      const usedLps: string[] = [];
      if (expectedToken.toLowerCase() === token.toLowerCase()) {
        continue;
      }
      console.log('expectedToken', await TokenUtils.tokenSymbol(expectedToken));
      if (parsedBC.has(token.toLowerCase() + expectedToken.toLowerCase())
        || parsedBC.has(expectedToken.toLowerCase() + token.toLowerCase())) {
        console.log('already parsed bc');
        continue;
      }
      while (true) {
        const lpData = await calculator.getLargestPool(token, usedLps);
        const lp = lpData[2];
        usedLps.push(lp);

        const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;

        let tokenOpposite;
        const token0 = await lpCtr.token0();
        const token1 = await lpCtr.token1();

        if (token0.toLowerCase() === token.toLowerCase()) {
          tokenOpposite = token1;
        } else if (token1.toLowerCase() === token.toLowerCase()) {
          tokenOpposite = token0;
        } else {
          throw Error('wrong lp');
        }

        const token0Name = await TokenUtils.tokenSymbol(token);
        const token1Name = await TokenUtils.tokenSymbol(tokenOpposite);


        const reserves = await lpCtr.getReserves();
        const token0Price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(token0));
        // const token1Price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(token1));
        const token0Dec = await TokenUtils.decimals(token0);
        // const token1Dec = await TokenUtils.decimals(token1);
        const res0 = +utils.formatUnits(reserves.reserve0, token0Dec) * token0Price;
        // const res1 = +utils.formatUnits(reserves.reserve1, token1Dec) * token1Price;
        const tvl = res0 * 2;

        console.log('BC PAIR: ', token0Name, token1Name, tvl.toFixed(0), lp)
        if (tvl < 1000000) {
          console.log('!!!!!!!!! => too low tvl');
          break;
        }
        if (tokenOpposite.toLowerCase() !== expectedToken.toLowerCase()) {
          continue;
        }

        if (blueChipsLps.includes(lp.toLowerCase())) {
          console.log('bc lp duplicate');
        } else {
          blueChipsLps.push(lp.toLowerCase());
        }
        parsedBC.add(token.toLowerCase() + tokenOpposite.toLowerCase());
        parsedBC.add(tokenOpposite.toLowerCase() + token.toLowerCase());
        break;
      }
    }
  }

  let bcLpsTxt = '[\n';

  for (const r of blueChipsLps) {
    bcLpsTxt += JSON.stringify(r) + ',\n';
  }
  bcLpsTxt = bcLpsTxt.slice(0, -2);

  bcLpsTxt += '\n]';
  writeFileSync(`./tmp/routes/${net}/bc.json`, bcLpsTxt, 'utf8');


  const vaultsSize = (await bookkeeper.vaultsLength()).toNumber();
  console.log('vaults', vaultsSize);

  const allTokens: string[] = [];
  const allLps: string[] = [];

  await addRoutes(core.rewardToken, calculator, allLps, allTokens);
  await addRoutes(MaticAddresses.USDC_TOKEN, calculator, allLps, allTokens);

  let i = 0;
  while (i < vaultsSize) {
    try {
      const vAdr = await bookkeeper._vaults(i);
      // const vAdr = '0xb4607D4B8EcFafd063b3A3563C02801c4C7366B2';
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

        await addRoutes(rt, calculator, allLps, allTokens);
      }

      const assets = await cReader.strategyAssets(strategy);
      for (const asset of assets) {
        await addRoutes(asset, calculator, allLps, allTokens);
      }

      i++;
    } catch (e) {
      console.error('Error in loop', e);
    }
  }

  let tokensTxt = '[\n';
  let lpsTxt = '[\n';

  for (const r of allTokens) {
    tokensTxt += JSON.stringify(r) + ',\n';
  }
  tokensTxt = tokensTxt.slice(0, -2);

  for (const r of allLps) {
    lpsTxt += JSON.stringify(r) + ',\n';
  }
  lpsTxt = lpsTxt.slice(0, -2);

  tokensTxt += '\n]';
  lpsTxt += '\n]';

  writeFileSync(`./tmp/routes/${net}/lps.json`, lpsTxt, 'utf8');
  writeFileSync(`./tmp/routes/${net}/tokens.json`, tokensTxt, 'utf8');
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

async function addRoutes(
  token: string,
  calculator: PriceCalculator,
  allLps: string[],
  allTokens: string[],
) {
  if (allTokens.includes(token.toLowerCase())) {
    return;
  }
  const data = await calculator.getLargestPool(token, []);
  const lp = data[2];
  allLps.push(lp.toLowerCase());
  allTokens.push(token.toLowerCase());
}

