import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['matic', new CoreAddresses(
        '1111111111111111111111111111111', // controller
        '1111111111111111111111111111111', // announcer
        '1111111111111111111111111111111', // forwarder
        '1111111111111111111111111111111', // bookkeeper
        '1111111111111111111111111111111', // notifier
        '1111111111111111111111111111111', // mint helper
        '1111111111111111111111111111111', // tetu token
        '1111111111111111111111111111111', // ps vault
        '1111111111111111111111111111111',// fund keeper
    )],
    ['rinkeby', new CoreAddresses(
        '0x00aEC86D06B4336bCA967b42724E3596d3622313', // controller
        '0xAC5C0014bdD5cb34149bA49eC879aE7b6fFF94b8', // announcer
        '0x804456cCD09C3b1dD99F1Aaa344144C4AFfd1c7e', // forwarder
        '0x758A7a9503A29558AEb6b848Ed0b698C01D19F93', // bookkeeper
        '0x3f37F1fAC94F4c0757c831A2a175d834f62FF497', // notifier
        '0x697C0c61a3644A51c65B870d4A25884F73b8A73C', // mint helper
        '0xB1F4691CA07c2202B43d874ac6F508c5b00F82bA', // tetu token
        '0x97f7540eb87e4cd54dd49BEB2ad0BEfCf3fDeFFE', // ps vault
        '0xa49d2Df50F51eb433C7233106e5E3bE98f77998F',// fund keeper
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['matic', new ToolsAddresses(
        '111111111111111111111111111111', // calculator
        '111111111111111111111111111111', // reader
        '111111111111111111111111111111', // utils
        '111111111111111111111111111111', // rebalancer
        '', // payrollClerk
        '', // mockFaucet
    )],
    ['rinkeby', new ToolsAddresses(
        '0x720297240ea63ce4dcc4588D726C0979EB53ee67', // calculator
        '0x100BCdeD3E235B8b174840d7Ef44fB6971Fc04a3', // reader
        '0x7d393E021d5E5f7C6B3C9Ce4FD6B0712daeEC6AE', // utils
        '0xDe3A5aC324c271C2F915b82C489A7b316714C442', // rebalancer
        '', // payrollClerk
        '0xE08a4d6aFC2f3bB5F95ceC1e4D88559d837C08F2', // mockFaucet
    )]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['matic', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
      ['sushi_lp_token_usdc', '1111111111111111111111111'],
    ])],
    ['rinkeby', new Map([
      ['quick', '0xDE93781D8805b2698948996D71Ed03268B6e8549'],
      ['sushi', '0x45128E1511C48Ed4A50FE1E1548B293Fd9901cad'],
      ['usdc', '0xa85682167bA1da84bccadEf0C737b63c14196803'],
      ['weth', '0x65741ef7bF896E9146125E289C0858552659B66b'],
      ['sushi_lp_token_usdc', '0x02436A8Ce8E92Fe980166b5edd8C844DC2EaC2ee'],
    ])],

  ]);

  public static ORACLE = '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559';
}
