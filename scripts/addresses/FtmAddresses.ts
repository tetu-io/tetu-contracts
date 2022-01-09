/* tslint:disable:variable-name */

// noinspection JSUnusedGlobalSymbols

export class FtmAddresses {

  public static ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  public static GOV_ADDRESS = "0x11d946C4Df8222940F9e7e6E56042Be2832B0871";
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
  public static FRAX_TOKEN = "0xdc301622e621166BD8E82f2cA0A26c13Ad0BE355".toLowerCase();
  public static renBTC_TOKEN = "0xDBf31dF14B66535aF65AaC99C32e9eA844e14501".toLowerCase();
  public static SPELL_TOKEN = "0x468003B688943977e6130F4F68F23aad939a1040".toLowerCase();

  // SpookySwap
  public static SPOOKY_SWAP_FACTORY = "0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3".toLowerCase();
  public static SPOOKY_SWAP_ROUTER = "0xF491e7B69E4244ad4002BC14e878a34207E38c29".toLowerCase();
  public static SPOOKY_MASTERCHEF = "0x2b2929E785374c651a81A63878Ab22742656DcDd".toLowerCase();
  public static SPOOKY_WFTM_SCREAM = "0x30872e4fc4edbfd7a352bfc2463eb4fae9c09086".toLowerCase();
  public static SPOOKY_TETU_USDC = "0x1b989bDE3aA642831596000e985b7D5EAeF2503e".toLowerCase();

  // Scream
  public static SCREAM_CONTROLLER = "0x260E596DAbE3AFc463e75B6CC05d8c46aCAcFB09".toLowerCase();
  public static SCREAM_scWFTM = "0x5aa53f03197e08c4851cad8c92c7922da5857e5d".toLowerCase();

  // TetuSwap
  public static TETU_SWAP_FACTORY = "0xFB6A440af0bbBAd0cC5f24323c7Df9d400084a12".toLowerCase();
  public static TETU_SWAP_ROUTER = "0xbd21EC4b56A50aBF3C52ca9977C26291632Ce5A6".toLowerCase();

  // Geist
  public static GEIST_PROTOCOL_DATA_PROVIDER = "0xf3B0611e2E4D2cd6aB4bb3e01aDe211c3f42A8C3".toLowerCase();

  // spirit swap
  public static SPIRIT_SWAP_FACTORY = "0xEF45d134b73241eDa7703fa787148D9C9F4950b0".toLowerCase();
  public static SPIRIT_SWAP_ROUTER = "0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52".toLowerCase();

  // curve
  public static CURVE_tricrypto_POOL = "0x3a1659Ddcf2339Be3aeA159cA010979FB49155FF".toLowerCase();
  public static CURVE_geist_POOL = "0x0fa949783947Bf6c1b171DB13AEACBB488845B3f".toLowerCase();
  public static CURVE_2_POOL = "0x27E611FD27b276ACbd5Ffd632E5eAEBEC9761E40".toLowerCase();
  public static CURVE_ren_POOL = "0x3eF6A01A0f81D6046290f3e2A8c5b843e738E604".toLowerCase();
  public static USD_BTC_ETH_CRV_TOKEN = "0x58e57cA18B7A47112b877E31929798Cd3D703b0f".toLowerCase();
  public static g3CRV_TOKEN = "0xD02a30d33153877BC20e5721ee53DeDEE0422B2F".toLowerCase();
  public static _2poolCrv_TOKEN = "0x27E611FD27b276ACbd5Ffd632E5eAEBEC9761E40".toLowerCase();
  public static renCRV_TOKEN = "0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858".toLowerCase();

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
