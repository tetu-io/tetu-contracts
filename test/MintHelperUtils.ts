import {utils} from "ethers";
import {MintHelper} from "../typechain";

export class MintHelperUtils {

  public static async mint(mintHelper: MintHelper, amount: string) {
    await mintHelper.mint(utils.parseUnits(amount));
  }

}
