import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['rinkeby', new CoreAddresses(
        '0xc463E58D71021A5f53C7cf1356Aa2bDB98c603ca', // controller
        '0x8F400eED3b2eC747010adb992E9d431DD1c0c86A', // forwarder
        '0x744340cF82D0e172E04d9a1B46e1566FE8D00799', // bookkeeper
        '0xD9325C41220035D61F31F2e570A8B36d605DC9F4', // notifier
        '0x0A2CF709a2B5CAd681D871F5E0d92f6031052689', // mint helper
        '0x608B279F1bCdaf54F83ab18f2Df7D097Bd5DAD86', // reward token
        '0x58471301Bc6Cd23A879278b0229C5bcC4FD5580B', // ps vault
        '0x5AB1A453c898a35345798E39962aF85869ba01F0'// fund keeper
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['rinkeby', new ToolsAddresses(
        '0xF71BdC833C2EB68222E161F4918998d4e5cd3Ee9', // calculator
        '0xF5eEd4fDd8101025B23fa1b52948361127202Cf1', // reader
        '0xc6cF9c053Cc3e025BfA12099a78969Ec523B7E09', // utils
        '0xfBa7EB74AbDf31892689023Cee4114517E3409b0' // rebalancer
    )]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['rinkeby', new Map([
      ['usdc', '0xe28036195f8a8dC9059dDB56749191b583a29750'],
      ['weth', '0x349c068861af5f832E36dcE8b42eE4a899c26Fa4'],
      ['sushi', '0xEeEDA255Fa41F4700904c9D2F3Bd3B255cF14CdB'],
      ['quick', '0x07d7A8136Ab267d03E5a35b8059aC055E23e471b'],
      ['sushi_lp_token_usdc', '0x719F8fa2b8587c55585a22aB23ABCB1001b06c8e'],
    ])],
    ['matic', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
    ])]
  ]);

  public static ORACLE = '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559';
}
