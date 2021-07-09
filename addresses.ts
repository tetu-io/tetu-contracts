import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['ropsten', new CoreAddresses(
        '0xfbE42B3937856d2384a583e77f5e3387ED6F3833', // controller
        '0xAaea86EAC3074Fa742466F6F0BaE23F7768977D4', // forwarder
        '0x118B44F894BdBa01D3190136b2F159366FE3B3a4', // bookkeeper
        '0x61E0D0b7b6b04c1C05ec7210295A55CbCd13d832', // notifier
        '0xE167E70198Fa3c73D8d3994c6f95d34C3A3F8236', // mint helper
        '0x4a2CF0A7A220AcFB9008a92345774b441d1dF27D', // reward token
        '0x2B18d5fae77ca2f95FC31e96bC0830B572Bdb196' // ps vault
    )],
    ['rinkeby', new CoreAddresses(
        '0x12261c200FF801F4a355ce6be18C0A1c715504c0', // controller
        '0x44691DF951a5894E322a271c9786b011C26Ac268', // forwarder
        '0x5C84E6778A1CB8A5a10cF5E050dfA57AF13c4fd3', // bookkeeper
        '0x43ef8b65efD1B8A4e248464E21D01542E8d971CF', // notifier
        '0xE97aCf577075d8C323B060835C2cA968503a664F', // mint helper
        '0x1852b41Ce53e46570263e330320EB594E607a0f4', // reward token
        '0x2dB8c43E0496c95f1beaB7e5296Bd1d03f0Ab6A0' // ps vault
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['ropsten', new ToolsAddresses(
        '0xc56dc76ad5865Af80c8F9e022D7Eb5369ec2EFC3', // calculator
        '0xc491CC353f96D8777C08Ad44F6361F57B4a60A23', // reader
        '0xD388cA73D22Edc220944d46290Efc5dCd71dBaf0', // utils
        '0xB6f4F269C4B73be221Ff5a02004Bd8154F60d820' // rebalancer
    )],
    ['rinkeby', new ToolsAddresses(
        '0xf3cfb67C9e0F0cf041CECB2eb6472BD2D431460c', // calculator
        '0x73B2288b7cceA4b2f27E4e67Ac66741b7856a018', // reader
        '0xc6cF9c053Cc3e025BfA12099a78969Ec523B7E09', // utils
        '' // rebalancer
    )]
  ]);

  public static MOCKS = new Map<string, Map<string, string>>([
    ['ropsten', new Map([
      ['usdc', '0x713Ea2FE8bE97aa211a08F08F781cdD407b79E86'],
      ['weth', '0xA1Be3379928998Ea3bAe61Bf71C4d544928f9f5d'],
      ['sushi', '0xcD68bD1Ae4511F264a922BfbB396f72D6E89f245'],
      ['quick', '0x48526Fb38CA3ed2c4c7e617ABDe3804edaDe8b4f'],
      ['sushi_lp_token_usdc', '0x6Df5b9bf9aFDE22B15C680dd7041B29bAb71DB6f'],
    ])],
    ['rinkeby', new Map([
      ['usdc', '0x93245d8A8daDb8279bAFb5ff7d2a8621664E4e21'],
      ['weth', '0x5e4b7943AE466464b295D2E4a3Ee992Cc16B6A4b'],
      ['sushi', '0xBDd96Cf06a3060238779c489FFeF273F99c730a3'],
      ['quick', '0x42242060330c2D322870725DD5F73D0d76279A84'],
      ['sushi_lp_token_usdc', '0x25e3042F433691ba59B490D32A470B9305fF848C'],
    ])]
  ]);

  public static ORACLE = '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559';
}
