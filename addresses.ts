import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['ropsten', new CoreAddresses(
        '0x6f36a3dAfC7ec9d3F7195cf871D9dC65746b22a3', // controller
        '0xb3Cf6c1c9B363803C08f7DE7aED4bD547Ab87abc', // announcer
        '0x0A903BBC774C27e380CfF463DdE434A17Be85F6c', // forwarder
        '0xb8B11F28E8fd87f1f9B3D9dcEc0cA2ae71F797bD', // bookkeeper
        '0xbE037f3e0278dE5d4cc33B1418dB23AC298AB5a4', // notifier
        '0xaa1c3380eA9A6fCaf70026682E57eA0F76e2F3b5', // mint helper
        '0x613d44e4a6B2b719150F9AF165abBE364A11B22E', // reward token
        '0x239fF904F9B26A64123b3b34cd9D3BCE97EE84F6', // ps vault
        '0x6E53aa96340e051755726e6931641BbFa95C0fab',// fund keeper
    )],
    ['rinkeby', new CoreAddresses(
        '0xc463E58D71021A5f53C7cf1356Aa2bDB98c603ca', // controller
        '', // announcer
        '0x8F400eED3b2eC747010adb992E9d431DD1c0c86A', // forwarder
        '0x744340cF82D0e172E04d9a1B46e1566FE8D00799', // bookkeeper
        '0xD9325C41220035D61F31F2e570A8B36d605DC9F4', // notifier
        '0x0A2CF709a2B5CAd681D871F5E0d92f6031052689', // mint helper
        '0x608B279F1bCdaf54F83ab18f2Df7D097Bd5DAD86', // reward token
        '0x58471301Bc6Cd23A879278b0229C5bcC4FD5580B', // ps vault
        '0x5AB1A453c898a35345798E39962aF85869ba01F0',// fund keeper
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['ropsten', new ToolsAddresses(
        '0xfE4E83D68719e32c299dC91945667BdDAfA4c890', // calculator
        '0xA6aBd3B087ABABD069D4a28F7970232c1e8d379A', // reader
        '0x860336F91F04282dbfd0094AfED8F838D8Ea8747', // utils
        '0x1D1A2146c515A9BF8Acd908762ae658E0A58b92e' // rebalancer
    )],
    ['rinkeby', new ToolsAddresses(
        '0xF71BdC833C2EB68222E161F4918998d4e5cd3Ee9', // calculator
        '0xF5eEd4fDd8101025B23fa1b52948361127202Cf1', // reader
        '0xc6cF9c053Cc3e025BfA12099a78969Ec523B7E09', // utils
        '0xfBa7EB74AbDf31892689023Cee4114517E3409b0' // rebalancer
    )]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['ropsten', new Map([
      ['quick', '0x6950e02CE65611e2BE836c4E4a178C809C9F9Ca0'],
      ['sushi', '0xF62824b58Dc75dDd57162aF9D49E74Ff32B83DbB'],
      ['usdc', '0xB851d825EaD7B054b234866FbB50497c5A1A8943'],
      ['weth', '0xa9c1533e812d93E7D79176BF123aa613c9596e0b'],
      ['sushi_lp_token_usdc', ''],
    ])],
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
