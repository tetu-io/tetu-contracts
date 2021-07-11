import {PriceCalculator} from "../typechain";
import {utils} from "ethers";
import {Erc20Utils} from "./Erc20Utils";
import {expect} from "chai";

export class PriceCalculatorUtils {

  public static async getFormattedPrice(
      calculator: PriceCalculator,
      token: string,
      outputToken: string
  ): Promise<number> {
    const price = +utils.formatUnits(
        await calculator.getPrice(token, outputToken),
        await Erc20Utils.decimals(token)
    );
    const name = await Erc20Utils.tokenName(token);
    const outputName = await Erc20Utils.tokenName(outputToken);
    console.log('price', name, 'against', outputName, price);
    expect(price).is.not.eq(0, name + " doesn't calculated");
    return price;
  }

}
