/* tslint:disable:variable-name */

// noinspection JSUnusedGlobalSymbols

export class EthAddresses {

  public static ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  public static GOV_ADDRESS = "0x4bE13bf2B983C31414b358C634bbb61230c332A7".toLowerCase();
  // tokens
  public static BAL_TOKEN = "0xba100000625a3754423978a60c9317c58a424e3D".toLowerCase();
  public static WETH_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase();
  public static USDC_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".toLowerCase();
  public static DAI_TOKEN = "0x6b175474e89094c44da98b954eedeac495271d0f".toLowerCase();
  public static USDT_TOKEN = "0xdac17f958d2ee523a2206206994597c13d831ec7".toLowerCase();
  public static WBTC_TOKEN = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599".toLowerCase();
  public static TETU_TOKEN = "0xa0246c9032bc3a600820415ae600c6388619a14d".toLowerCase(); // todo temporally FARM
  public static veBAL_TOKEN = "0xC128a9954e6c874eA3d62ce62B468bA073093F25".toLowerCase();


  // balancer
  public static BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8".toLowerCase();
  public static BALANCER_FEE_DISTRIBUTOR = "0x26743984e3357eFC59f2fd6C1aFDC310335a61c9".toLowerCase();
  public static BALANCER_BAL_WETH_ID = "0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014";
  public static BALANCER_USDC_WETH_ID = "0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019";
  public static BALANCER_USDC_WETH = "0x96646936b91d6B9D7D0c47C496AfBF3D6ec7B6f8".toLowerCase();
  public static BALANCER_BAL_WETH = "0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56".toLowerCase();
  public static BALANCER_GAUGE_CONTROLLER = "0xC128468b7Ce63eA702C1f104D55A2566b13D3ABD".toLowerCase();
  public static BALANCER_GAUGE_USDC_WETH = "0x9AB7B0C7b154f626451c9e8a68dC04f58fb6e5Ce".toLowerCase();

  // uniswap
  public static UNISWAP_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f".toLowerCase();
  public static UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".toLowerCase();

  public static BLUE_CHIPS = new Set<string>([
    EthAddresses.USDC_TOKEN,
    EthAddresses.WETH_TOKEN,
  ]);

  public static getRouterByFactory(factory: string): string {
    switch (factory.toLowerCase()) {
      case EthAddresses.UNISWAP_FACTORY:
        return EthAddresses.UNISWAP_ROUTER;
    }
    throw Error('Unknown factory ' + factory);
  }

  //
  // public static getRouterName(router: string): string {
  //   switch (router.toLowerCase()) {
  //     case FtmAddresses.TETU_SWAP_ROUTER:
  //       return "TETU";
  //     case FtmAddresses.SPOOKY_SWAP_ROUTER:
  //       return "SPOOKY";
  //   }
  //   throw Error('Unknown router ' + router);
  // }

  public static isBlueChip(address: string): boolean {
    return EthAddresses.BLUE_CHIPS.has(address.toLowerCase())
  }
}
