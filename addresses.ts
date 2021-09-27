import {CoreAddresses} from "./scripts/models/CoreAddresses";
import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class Addresses {

  public static CORE = new Map<string, CoreAddresses>([
    ['matic', new CoreAddresses(
        '0x6678814c273d5088114B6E40cC49C8DB04F9bC29', // controller
        '0x286c02C93f3CF48BB759A93756779A1C78bCF833', // announcer
        '0xd055b086180cB6dac888792C9307970Ed10CF137', // forwarder
        '0x0A0846c978a56D6ea9D2602eeb8f977B21F3207F', // bookkeeper
        '0x560471ab39C3Eb26D63aB3b2A5b9835764C998ea', // notifier
        '0x81367059892aa1D8503a79a0Af9254DD0a09afBF', // mint helper
        '0x255707B70BF90aa112006E1b07B9AeA6De021424', // tetu token
        '0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454', // ps vault
        '0x7AD5935EA295c4E743e4f2f5B4CDA951f41223c2',// fund keeper
        '0xC5b3aF6FB4b2ff14642e337F41B86C9494f70b43',// vault controller
        '0x52646dfb3E1D540D85DC32223A220a6F9c7eD759',// vault logic
    )],
    ['rinkeby', new CoreAddresses(
        '0x423394A1723C81a2a9E3Ee1852Bc55Db7B85bfE1', // controller
        '0x42A323CF86FE5E8c2B1aAb8C38F7Cd6bd4f05c9c', // announcer
        '0x472a3B6DB960407378BF8b51Ee3b841Ee281d06D', // forwarder
        '0xFB1e7bF70FFBbD195c692AA79F2721e0143A42Bc', // bookkeeper
        '0x44487fB06DF0E2712c13f617C46301301B1B8B88', // notifier
        '0x2eABFA0f09D3F393beC9Efb102066733c0030D36', // mint helper
        '0x4604E8C1504F0F95DB69d23EADeae699ACd93feB', // tetu token
        '0xAec561cF4F54756EBB9E897b7fdbb444DE8783bA', // ps vault
        '0x1b6E2a7AcB8f79044bE4b384fa7A1Cac1259bb72',// fund keeper
        '0xb990e66DAbda0a30a6d79fe9e7f5aeD36E59156b',// vault controller
        '0x57E9994EC192d9661a2a1e3A84a38c8aaD013937',// vault logic
    )]
  ]);

  public static TOOLS = new Map<string, ToolsAddresses>([
    ['matic', new ToolsAddresses(
        '0x0B62ad43837A69Ad60289EEea7C6e907e759F6E8', // calculator
        '0xCa9C8Fba773caafe19E6140eC0A7a54d996030Da', // reader
        '0x0D4D9e9E43e97f31C81a75415C4307c4b58AbF59', // utils
        '0xFE700D523094Cc6C673d78F1446AE0743C89586E', // rebalancer
        '0x9Accc3016c0CE34e1D127849A18DF4Bd6Ecb7aB3', // payrollClerk
        '', // mockFaucet
        '0x6b887F2BE347984D55bC1a21BB970c707566eB48', // multiSwap
        '0x980cc507CDA067Fc71e90a5966A526DEBFB1eE74', // zapContract
        '', // zapContractIron //TODO deploy
        '0x9e059EdB32FC27430CfC8c9025a55B7C0FcFAbda', // multicall
    )],
    ['rinkeby', new ToolsAddresses(
        '0x9b8205F7fa03FD4DFc29c9b0E553883913ec4132', // calculator
        '0x9B1F56a7cE7529522C2E5F32C13422654808Ea7a', // reader
        '0x51be2Ad4f39CC0f722E6900F1db8cb0196ed01b2', // utils
        '0x56b44897c8333fa08DaEC0dc8c16695750b24c6D', // rebalancer
        '', // payrollClerk
        '0xE08a4d6aFC2f3bB5F95ceC1e4D88559d837C08F2', // mockFaucet
        '0xe5C203ef4CB3E56766E7936fDE4b157209e93dD5', // multiSwap
        '0x9Ff04B5D8f6e7fFF99DBE07CAa9a83467Ec4A1c1', // zapContract
        '', // zapContractIron
        '', // multicall
    )]
  ]);

  public static TOKENS = new Map<string, Map<string, string>>([
    ['matic', new Map([
      ['usdc', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'],
      ['sushi_lp_token_usdc', '0xF1c97B5d031f09f64580Fe79FE30110A8C971bF9'],
      ['quick_lp_token_usdc', '0x22E2BDaBEbA9b5ff8924275DbE47aDE5cf7b822B'],
    ])],
    ['rinkeby', new Map([
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
