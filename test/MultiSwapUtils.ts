import {MultiSwap} from "../typechain";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "./TokenUtils";
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

    const tokenInDec = await TokenUtils.decimals(tokenIn);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThan(+utils.formatUnits(amount, tokenInDec));

    const lps = await multiSwap.findLpsForSwaps(tokenIn, tokenOut);

    await TokenUtils.approve(tokenIn, signer, multiSwap.address, amount.toString())
    await multiSwap.multiSwap(lps, tokenIn, tokenOut, amount, slippageTolerance);

    const bal = await TokenUtils.balanceOf(tokenOut, signer.address);
    expect(bal).is.not.eq(0);

    return bal;
  }


}
