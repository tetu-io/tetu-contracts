import {PriceCalculator, PriceCalculator__factory} from "../typechain";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "./TokenUtils";
import {expect} from "chai";
import {ethers} from "hardhat";
import {Logger} from "tslog";
import logSettings from "../log_settings";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";

const log: Logger = new Logger(logSettings);

export class PriceCalculatorUtils {

  public static async getFormattedPrice(
    calculator: PriceCalculator,
    token: string,
    outputToken: string
  ): Promise<number> {
    const price = +utils.formatUnits(await calculator.getPrice(token, outputToken));
    const name = await TokenUtils.tokenName(token);
    const outputName = await TokenUtils.tokenName(outputToken);
    console.log('price', name, 'against', outputName, price);
    expect(price).is.not.eq(0, name + " doesn't calculated");
    return price;
  }

  // keep this method for possible implement caches
  public static async getPriceCached(token: string, calculator: PriceCalculator | null = null): Promise<BigNumber> {
    const net = await ethers.provider.getNetwork();
    if (calculator == null) {
      const tools = await DeployerUtils.getToolsAddresses();
      calculator = PriceCalculator__factory.connect(tools.calculator, ethers.provider);
    }
    if (net.chainId === 137 || net.chainId === 250) {
      return calculator.getPriceWithDefaultOutput(token);
    } else {
      throw Error('No config for ' + net.chainId);
    }
    // const response = await axios.get(`https://tetu-server-staging.herokuapp.com/api/v1/price/longTTL/?token=${token}&network=${network}`);
    // log.info('price for', token, response?.data?.result);
    // return BigNumber.from(response?.data?.result);
  }

}
