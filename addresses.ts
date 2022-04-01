import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";
import {MaticCoreAddresses} from "./addresses_core_matic";
import {RinkebyCoreAddress} from "./addresses_core_rinkeby";
import {MaticToolsAddresses} from "./addresses_tools_matic";
import {RinkebyToolsAddresses} from "./addresses_tools_rinkeby";
import {FtmCoreAddresses} from "./addresses_core_ftm";
import {FtmToolsAddresses} from "./addresses_tools_ftm";
import {EthereumToolsAddresses} from "./addresses_tools_ethereum";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['137', MaticCoreAddresses.ADDRESSES],
    ['250', FtmCoreAddresses.ADDRESSES],
    ['4', RinkebyCoreAddress.ADDRESSES]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['137', MaticToolsAddresses.ADDRESSES],
    ['250', FtmToolsAddresses.ADDRESSES],
    ['4', RinkebyToolsAddresses.ADDRESSES],
    ['1', EthereumToolsAddresses.ADDRESSES]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['1', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
    ])],
    ['137', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
      ['sushi_lp_token_usdc', '0xF1c97B5d031f09f64580Fe79FE30110A8C971bF9'],
      ['quick_lp_token_usdc', '0x22E2BDaBEbA9b5ff8924275DbE47aDE5cf7b822B'],
    ])],
    ['250', new Map([
      ['usdc', '0x04068da6c83afcfa0e13ba15a6696662335d5b75'],
    ])],
    ['4', new Map([
      ['quick', '0xDE93781D8805b2698948996D71Ed03268B6e8549'],
      ['sushi', '0x45128E1511C48Ed4A50FE1E1548B293Fd9901cad'],
      ['usdc', '0xa85682167bA1da84bccadEf0C737b63c14196803'],
      ['weth', '0x65741ef7bF896E9146125E289C0858552659B66b'],
      ['sushi_lp_token_usdc', '0x02436A8Ce8E92Fe980166b5edd8C844DC2EaC2ee'],
      ['quick_lp_token_usdc', ''],
    ])],

  ]);

  public static ORACLE = '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559';
}
