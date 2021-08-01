import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import { Settings } from "../../../../settings";
import { startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { UniswapUtils } from "../../../UniswapUtils";
import {utils} from "ethers";
import {ethers} from "hardhat";
import { Erc20Utils } from "../../../Erc20Utils";
import {Gauge, ICurveDeposit3tokenUnderlying, IERC20, PriceCalculator, StrategyBase} from "../../../../typechain";



const {expect} = chai;
chai.use(chaiAsPromised);

async function buyUnderliying(user: SignerWithAddress, underlying:string, calculator: PriceCalculator){
  // swap tokens to invest
  await UniswapUtils.buyToken(user, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
  await UniswapUtils.buyToken(user, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('1000000'));

  
  // To buy am3CRV underliying token we need to use depositor contract (0x445FE580eF8d70FF569aB36e80c647af338db351)
  let depositerAddress = "0x445FE580eF8d70FF569aB36e80c647af338db351";
  var depContract = await ethers.getContractAt("ICurveDeposit3tokenUnderlying", depositerAddress, user) as ICurveDeposit3tokenUnderlying;
  const token = await ethers.getContractAt("IERC20", MaticAddresses.USDC_TOKEN, user) as IERC20;
  var usdcUserBalance = await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, user.address);
  await token.approve(depositerAddress, usdcUserBalance, {from: user.address});
  
  // swap USDC to underlying Curve.fi amDAI/amUSDC/amUSDT (am3CRV) (0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171)
  await depContract.add_liquidity([0, usdcUserBalance, 0], 0, true);
}

async function toClaimCalcFunc(strategy: StrategyBase) {
  let gaugeAddress = "0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c";
  var gaugeContract = await ethers.getContractAt("Gauge", gaugeAddress) as Gauge;
  await gaugeContract.claimable_reward_write(strategy.address, MaticAddresses.WMATIC_TOKEN);
  
}

describe('Universal Curve tests', async () => {
  if (Settings.disableStrategyTests) {
    return;
  }

    const idx = "1";
    const lp_name = "CURVE_AAVE";
    const underlying = "0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171"; // am3CRV
    const token0_name = "am3CRV"; //Curve.fi amDAI/amUSDC/amUSDT (am3CRV)


    console.log('strat', idx, lp_name);

    startDefaultSingleTokenStrategyTest(
      'StrategyCurveAave',
      MaticAddresses.SUSHI_FACTORY,
      underlying.toLowerCase(),
      "",
      token0_name,
      idx,
      [MaticAddresses.WMATIC_TOKEN, MaticAddresses.CRV_TOKEN],
      buyUnderliying,
      6000,
      toClaimCalcFunc
  );
  
  }
);

