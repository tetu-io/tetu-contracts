import {TokenUtils} from "./TokenUtils";
import {utils} from "ethers";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";
import {ContractReader, IUniswapV2Pair, MultiSwap, SmartVault, ZapContract} from "../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";

export class ZapUtils {

  public static async zapLpIn(
      signer: SignerWithAddress,
      multiSwap: MultiSwap,
      zapContract: ZapContract,
      cReader: ContractReader,
      vault: string,
      tokenIn: string,
      amountN = 1000,
      slippage: number
  ) {
    console.log("zap lp in", amountN, slippage);
    const tokenInDec = await TokenUtils.decimals(tokenIn);
    const amount = utils.parseUnits(amountN.toString(), tokenInDec);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThanOrEqual(amountN);

    const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const strategy = await smartVault.strategy()
    const assets = await cReader.strategyAssets(strategy);
    if (assets.length !== 2) {
      throw Error("wrong vault assets");
    }

    const tokensOut = [];
    const tokensOutLps = [];
    for (let asset of assets) {
      let lps: string[] = [];
      if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
        lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
      }

      console.log('zapLpIn ============', await TokenUtils.tokenSymbol(tokenIn), '=>', await TokenUtils.tokenSymbol(asset))
      for (let lp of lps) {
        const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
        const t0 = await lpCtr.token0();
        const t1 = await lpCtr.token1();
        console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
      }
      console.log('============')

      tokensOut.push(asset);
      tokensOutLps.push(lps);
    }

    await TokenUtils.approve(tokenIn, signer, zapContract.address, amount.toString());
    await zapContract.connect(signer).zapIntoLp(
        vault,
        tokenIn,
        tokensOut[0],
        tokensOutLps[0],
        tokensOut[1],
        tokensOutLps[1],
        amount,
        slippage
    );
  }

  public static async zapLpOut(
      signer: SignerWithAddress,
      multiSwap: MultiSwap,
      zapContract: ZapContract,
      cReader: ContractReader,
      vault: string,
      tokenOut: string,
      amountShare: string,
      slippage: number
  ) {
    console.log("zap lp out", amountShare, slippage);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(vault, signer.address)))
    .is.greaterThanOrEqual(+utils.formatUnits(amountShare));

    const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const strategy = await smartVault.strategy()
    const assets = await cReader.strategyAssets(strategy);

    const assetsLpRoute = [];
    for (let asset of assets) {
      let lps: string[] = [];
      if (tokenOut.toLowerCase() !== asset.toLowerCase()) {
        lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();
      }

      console.log('zapLpOut ============', await TokenUtils.tokenSymbol(asset), '=>', await TokenUtils.tokenSymbol(tokenOut))
      for (let lp of lps) {
        const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
        const t0 = await lpCtr.token0();
        const t1 = await lpCtr.token1();
        console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
      }
      console.log('============')

      assetsLpRoute.push(lps);
    }

    await TokenUtils.approve(vault, signer, zapContract.address, amountShare.toString())
    await zapContract.connect(signer).zapOutLp(
        vault,
        tokenOut,
        assets[0],
        assetsLpRoute[0],
        assets[1],
        assetsLpRoute[1],
        amountShare,
        slippage
    );
  }

}
