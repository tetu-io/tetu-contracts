import {MultiSwap} from "../typechain";
import {BigNumber, utils} from "ethers";
import {Erc20Utils} from "./Erc20Utils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";

export class MultiSwapUtils {

  public static async multiSwap(
      signer: SignerWithAddress,
      multiSwap: MultiSwap,
      tokenIn: string,
      tokenOut: string,
      amount: BigNumber,
      slippageTolerance: number
  ): Promise<BigNumber> {

    const tokenInDec = await Erc20Utils.decimals(tokenIn);

    expect(+utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThan(+utils.formatUnits(amount, tokenInDec));

    const lps = await multiSwap.findLpsForSwaps(tokenIn, tokenOut);

    await Erc20Utils.approve(tokenIn, signer, multiSwap.address, amount.toString())
    await multiSwap.multiSwap(lps, tokenIn, tokenOut, amount, slippageTolerance);

    const bal = await Erc20Utils.balanceOf(tokenOut, signer.address);
    expect(bal).is.not.eq(0);

    return bal;
  }


}
