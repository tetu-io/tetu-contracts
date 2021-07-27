import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['rinkeby', new CoreAddresses(
        '0xa2a99fE350491CfF35F75E1FF0386B9310b8c364', // controller
        '0xffb0cE39DBD51dC064F7E80C6198BAbC70ccb8E5', // announcer
        '0x4C33729E91848bb2e472B2aDA871621c4995b9bD', // forwarder
        '0xa4fb458B0f8b2607a52553998Ad9b1c56C0c4cB8', // bookkeeper
        '0xA9724d2660B97d1Da6a3A8c94F193D4dEC3520DD', // notifier
        '0x9273750D1C82898f906FF2Fee4cA18ddaDDC4d25', // mint helper
        '0xBb674Ef2b497c5C77A449725ae8e17549A1C1E44', // reward token
        '0xC7f281d15dA4F38A2e01A3C72AE0906BAf9f899A', // ps vault
        '0x1C6CeE1d2D3ebFf4A1520703007b4191BB1b8CaE',// fund keeper
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['rinkeby', new ToolsAddresses(
        '0x2a8c76ba7624F466C1095D1cC9a4cC4e9615AC14', // calculator
        '0x2bcFb955d2F2803Ff6f78d3F228305Cf76D1554C', // reader
        '0x7aa7a174Fc6c514abEA2B8fcb92665275764F016', // utils
        '0x56A0e1A340DdA4078C76C8EB974893CAbfCc3f9F' // rebalancer
    )]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['rinkeby', new Map([
      ['usdc', '0xDE93781D8805b2698948996D71Ed03268B6e8549'],
      ['weth', '0x45128E1511C48Ed4A50FE1E1548B293Fd9901cad'],
      ['sushi', '0xa85682167bA1da84bccadEf0C737b63c14196803'],
      ['quick', '0x65741ef7bF896E9146125E289C0858552659B66b'],
      ['sushi_lp_token_usdc', '0x02436A8Ce8E92Fe980166b5edd8C844DC2EaC2ee'],
    ])],
    ['matic', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
    ])]
  ]);

  public static ORACLE = '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559';
}
