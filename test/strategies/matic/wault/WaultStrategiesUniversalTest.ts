import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";
import {readFileSync} from "fs";
import {Settings} from "../../../../settings";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { PriceCalculator } from "../../../../typechain";
import { UniswapUtils } from "../../../UniswapUtils";
import { Erc20Utils } from "../../../Erc20Utils";
import { utils } from "ethers";


const {expect} = chai;
chai.use(chaiAsPromised);

async function buyUnderliyingFunc(user: SignerWithAddress, underlying:string, calculator: PriceCalculator){
  const largest = (await calculator.getLargestPool(underlying, []));
  const tokenOpposite = largest[0];
  const tokenOppositeFactory = await calculator.swapFactories(largest[1]);
  console.log('largest', largest);

  //************** add funds for investing ************
  const baseAmount = 10_000;
  await UniswapUtils.buyAllBigTokens(user);
  const name = await Erc20Utils.tokenSymbol(tokenOpposite);
  const dec = await Erc20Utils.decimals(tokenOpposite);
  const price = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(tokenOpposite)));
  console.log('tokenOpposite Price', price, name);
  const amountForSell = baseAmount / price;
  console.log('amountForSell', amountForSell);

  await UniswapUtils.buyToken(user, MaticAddresses.getRouterByFactory(tokenOppositeFactory),
      underlying, utils.parseUnits(amountForSell.toString(), dec), tokenOpposite);
}

describe('Universal Wault tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/generate/wault/wault_pools.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || idx === '0') {
      console.log('skip', idx);
      return;
    }
    if (Settings.onlyOneWaultStrategyTest && +strat[0] !== Settings.onlyOneWaultStrategyTest) {
      return;
    }

    console.log('strat', idx, lp_name);


    if (strat[6]) {
      startDefaultLpStrategyTest(
          'StrategyWaultLp',
          MaticAddresses.WAULT_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          token1,
          token1_name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN]
      );
    } else {
      startDefaultSingleTokenStrategyTest(
          'StrategyWaultSingle',
          MaticAddresses.WAULT_FACTORY,
          lp_address.toLowerCase(),
          token0,
          token0_name,
          idx,
          [MaticAddresses.WEXpoly_TOKEN],
          buyUnderliyingFunc,
          60,
          null
      );
    }
  });


});
