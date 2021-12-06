/* tslint:disable:variable-name */

// noinspection JSUnusedGlobalSymbols

export class FtmAddresses {

  public static ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  public static GOV_ADDRESS = "0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94";
  // tokens
  public static TETU_TOKEN = "0x65c9d9d080714cDa7b5d58989Dc27f897F165179".toLowerCase();
  public static WETH_TOKEN = "0x74b23882a30290451a17c44f4f05243b6b58c76d".toLowerCase();
  public static USDC_TOKEN = "0x04068da6c83afcfa0e13ba15a6696662335d5b75".toLowerCase();
  public static WBTC_TOKEN = "0x321162cd933e2be498cd2267a90534a804051b11".toLowerCase();
  public static DAI_TOKEN = "0x8d11ec38a3eb5e956b052f67da8bdc9bef8abf3e".toLowerCase();
  public static fUSDT_TOKEN = "0x049d68029688eabf473097a2fc38ef61633a3c7a".toLowerCase();
  public static WFTM_TOKEN = "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83".toLowerCase();
  public static BOO_TOKEN = "0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE".toLowerCase();
  public static GEIST_TOKEN = "0xd8321AA83Fb0a4ECd6348D4577431310A6E0814d".toLowerCase();
  public static SCREAM_TOKEN = "0xe0654C8e6fd4D733349ac7E09f6f23DA256bF475".toLowerCase();
  public static YFI_TOKEN = "0x29b0Da86e484E1C0029B56e817912d778aC0EC69".toLowerCase();
  public static CRV_TOKEN = "0x1E4F97b9f9F913c46F1632781732927B9019C68b".toLowerCase();
  public static FUSD_TOKEN = "0xAd84341756Bf337f5a0164515b1f6F993D194E1f".toLowerCase();
  public static LINK_TOKEN = "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8".toLowerCase();
  public static DOLA_TOKEN = "0x3129662808bEC728a27Ab6a6b9AFd3cBacA8A43c".toLowerCase();
  public static MIM_TOKEN = "0x82f0B8B456c1A451378467398982d4834b6829c1".toLowerCase();
  public static BIFI_TOKEN = "0xd6070ae98b8069de6B494332d1A1a81B6179D960".toLowerCase();
  public static TUSD_TOKEN = "0x9879aBDea01a879644185341F7aF7d8343556B7a".toLowerCase();
  public static FBTC_TOKEN = "0xe1146b9AC456fCbB60644c36Fd3F868A9072fc6E".toLowerCase();
  public static FETH_TOKEN = "0x658b0c7613e890EE50B8C4BC6A3f41ef411208aD".toLowerCase();

  // SpookySwap
  public static SPOOKY_SWAP_FACTORY = "0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3".toLowerCase();
  public static SPOOKY_SWAP_ROUTER = "0xF491e7B69E4244ad4002BC14e878a34207E38c29".toLowerCase();
  public static SPOOKY_MASTERCHEF = "0x2b2929E785374c651a81A63878Ab22742656DcDd".toLowerCase();

  // Scream
  public static SCREAM_CONTROLLER = "0x260E596DAbE3AFc463e75B6CC05d8c46aCAcFB09".toLowerCase();
  // TetuSwap
  public static TETU_SWAP_FACTORY = "".toLowerCase();
  public static TETU_SWAP_ROUTER = "".toLowerCase();

  // Geist
  public static GEIST_PROTOCOL_DATA_PROVIDER = "0xf3B0611e2E4D2cd6aB4bb3e01aDe211c3f42A8C3".toLowerCase();

  public static BLUE_CHIPS = new Set<string>([
    FtmAddresses.USDC_TOKEN,
    FtmAddresses.fUSDT_TOKEN,
    FtmAddresses.DAI_TOKEN,
    FtmAddresses.WETH_TOKEN,
    FtmAddresses.WBTC_TOKEN,
    FtmAddresses.WFTM_TOKEN,
  ]);

  public static getRouterByFactory(factory: string): string {
    switch (factory.toLowerCase()) {
      case FtmAddresses.TETU_SWAP_FACTORY:
        return FtmAddresses.TETU_SWAP_ROUTER;
      case FtmAddresses.SPOOKY_SWAP_FACTORY:
        return FtmAddresses.SPOOKY_SWAP_ROUTER;
    }
    throw Error('Unknown factory ' + factory);
  }

  public static getRouterName(router: string): string {
    switch (router.toLowerCase()) {
      case FtmAddresses.TETU_SWAP_ROUTER:
        return "TETU";
      case FtmAddresses.SPOOKY_SWAP_ROUTER:
        return "SPOOKY";
    }
    throw Error('Unknown router ' + router);
  }

  public static isBlueChip(address: string): boolean {
    return FtmAddresses.BLUE_CHIPS.has(address.toLowerCase())
  }
}
