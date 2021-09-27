import {PriceCalculator} from "../typechain";
import {utils} from "ethers";
import {TokenUtils} from "./TokenUtils";
import {expect} from "chai";

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

}
