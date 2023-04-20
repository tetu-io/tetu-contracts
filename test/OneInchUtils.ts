import fetch from "node-fetch";

export type ISwapQuote = {
  tx: {data: string,},
  toTokenAmount: string,
}

export class OneInchUtils {
  static async swapQuote(tokenIn: string, tokenOut: string, amount: string, zapContractAddress: string): Promise<ISwapQuote> {
    const params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: tokenOut,
      amount,
      fromAddress: zapContractAddress,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
      protocols: 'POLYGON_UNISWAP_V3,POLYGON_BALANCER_V2,POLYGON_DYSTOPIA',
    };

    const swapQuoteAsset = await this.buildTxForSwap(JSON.stringify(params));
    console.log(`1inch tx data for swap ${amount} of ${tokenIn} to ${tokenOut}: `, swapQuoteAsset.tx.data);

    return swapQuoteAsset
  }

  static apiRequestUrl(methodName: string, queryParams: string) {
    const chainId = 137;
    const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
    const r = (new URLSearchParams(JSON.parse(queryParams))).toString();
    return apiBaseUrl + methodName + '?' + r;
  }

  static async buildTxForSwap(params: string): Promise<ISwapQuote> {
    const url = this.apiRequestUrl('/swap', params);
    console.log('url', url)
    return fetch(url).then(res => {
      // console.log('res', res)
      return res.json();
    })/*.then(res => res.tx)*/;
  }
}