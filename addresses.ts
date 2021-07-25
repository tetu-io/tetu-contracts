import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['ropsten', new CoreAddresses(
        '0x8f527486B877B556992dcE0BEc1964C91363bAb5', // controller
        '0xD7c22191808a6eDd2E90Eca5B8630Cb2Eb9e5B8F', // announcer
        '0x2a3fF2fEA5ad4B0abb4D096141CE8Ef77deEE6D3', // forwarder
        '0x52bd9D4e6965Ccc1bb63Ef7e913d591f69AcD992', // bookkeeper
        '0xe9a02A2703F88974963655f804F33e5cD731a822', // notifier
        '0x799B421CD759eB608a9c994066287E6D2Fe5AcE7', // mint helper
        '0xBee129D03df2CDBa03073a86877FDbd0699C70C6', // reward token
        '0xcBf41541EbEc92578b371C3770EB333d160a43F1', // ps vault
        '0x7F4AA3a90f4c0752C943FC5cC8c24030182A7880',// fund keeper
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
        '0x86eE90ADbbFe1f8e909206666cFd79C0e1E980b1', // calculator
        '0xB4EDd163B2D3bb548F933Dc1bdDBca6ba99cFF4a', // reader
        '0x8a7E79fD1ec1697E0b509F433c61bd2021E0bC9e', // utils
        '0x1BDA954af65231525563D88dF5c55fE261042e5E' // rebalancer
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
