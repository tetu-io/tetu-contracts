import {BigNumberish} from "ethers";

export const _SLIPPAGE_DENOMINATOR = 10000;

export interface ISwapStep {
  poolId: string;
  assetInIndex: number;
  assetOutIndex: number;
  amount: BigNumberish;
  userData: string;
  platformFee: BigNumberish;
}

export interface ISwapInfo {
  swapData: ISwapData;
  tokenAddresses: string[];
  swaps: ISwapStep[];
  swapAmount: BigNumberish;
  swapAmountForSwaps?: BigNumberish; // Used with stETH/wstETH
  returnAmount: BigNumberish;
  returnAmountFromSwaps?: BigNumberish; // Used with stETH/wstETH
  returnAmountConsideringFees: BigNumberish;
  tokenIn: string;
  tokenOut: string;
  marketSp: BigNumberish;
}

export interface ISwapData {
  tokenIn: string;
  tokenOut: string;
  swapAmount: BigNumberish;
  returnAmount: BigNumberish;
}

export interface ITestData {
  [key: string]: ISwapInfo
}
