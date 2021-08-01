import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['matic', new CoreAddresses(
        '0x6678814c273d5088114B6E40cC49C8DB04F9bC29', // controller
        '0x286c02C93f3CF48BB759A93756779A1C78bCF833', // announcer
        '0xd055b086180cB6dac888792C9307970Ed10CF137', // forwarder
        '0x0A0846c978a56D6ea9D2602eeb8f977B21F3207F', // bookkeeper
        '0x099C314F792e1F91f53765Fc64AaDCcf4dCf1538', // notifier
        '0x81367059892aa1D8503a79a0Af9254DD0a09afBF', // mint helper
        '0x255707B70BF90aa112006E1b07B9AeA6De021424', // tetu token
        '0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454', // ps vault
        '0x7AD5935EA295c4E743e4f2f5B4CDA951f41223c2',// fund keeper
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
        '0x0B62ad43837A69Ad60289EEea7C6e907e759F6E8', // calculator
        '0xCa9C8Fba773caafe19E6140eC0A7a54d996030Da', // reader
        '0xdfB765935D7f4e38641457c431F89d20Db571674', // utils
        '0xFE700D523094Cc6C673d78F1446AE0743C89586E', // rebalancer
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
      ['sushi_lp_token_usdc', '0xF1c97B5d031f09f64580Fe79FE30110A8C971bF9'],
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
