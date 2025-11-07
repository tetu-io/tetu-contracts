import {config as dotEnvConfig} from "dotenv";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-solhint";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "solidity-coverage"
import "hardhat-abi-exporter"
import {task} from "hardhat/config";
import {deployContract} from "./scripts/deploy/DeployContract";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    hardhatChainId: {
      type: "number",
      default: 31337
    },
    maticRpcUrl: {
      type: "string",
    },
    ftmRpcUrl: {
      type: "string",
    },
    ethRpcUrl: {
      type: "string",
      default: ''
    },
    bscRpcUrl: {
      type: "string",
      default: 'https://bsc-dataseed.binance.org/'
    },
    goerliRpcUrl: {
      type: "string",
      default: ''
    },
    sepoliaRpcUrl: {
      type: "string",
      default: ''
    },
    baseRpcUrl: {
      type: "string",
      default: ''
    },
    sepoliaOpRpcUrl: {
      type: "string",
      default: 'https://sepolia.optimism.io'
    },
    realRpcUrl: {
      type: "string",
      default: 'https://real.drpc.org'
    },
    infuraKey: {
      type: "string",
    },
    networkScanKey: {
      type: "string",
    },
    networkScanKeyMatic: {
      type: "string",
    },
    networkScanKeyFtm: {
      type: "string",
    },
    networkScanKeyBsc: {
      type: "string",
    },
    networkScanKeyBase: {
      type: "string",
    },
    networkScanKeyOpSepolia: {
      type: "string",
    },
    privateKey: {
      type: "string",
      default: "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e" // random account
    },
    ethForkBlock: {
      type: "number",
      default: 0
    },
    maticForkBlock: {
      type: "number",
      default: 0
    },
    ftmForkBlock: {
      type: "number",
      default: 0
    },
    bscForkBlock: {
      type: "number",
      default: 0
    },
    loggingEnabled: {
      type: "boolean",
      default: false
    },
  }).argv;

task("deploy", "Deploy contract", async function (args, hre, runSuper) {
  const [signer] = await hre.ethers.getSigners();
  // tslint:disable-next-line:ban-ts-ignore
  // @ts-ignore
  await deployContract(hre, signer, args.name)
}).addPositionalParam("name", "Name of the smart contract to deploy");

export default {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: argv.hardhatChainId,
      timeout: 99999999,
      chains: {
        137: {
          hardforkHistory: {
            berlin: 10000000,
            london: 20000000,
          },
        },
      },
      gas: argv.hardhatChainId === 1 ? 19_000_000 :
        argv.hardhatChainId === 137 ? 19_000_000 :
          argv.hardhatChainId === 250 ? 11_000_000 :
            9_000_000,
      forking: argv.hardhatChainId !== 31337 ? {
        url:
          argv.hardhatChainId === 1 ? argv.ethRpcUrl :
            argv.hardhatChainId === 137 ? argv.maticRpcUrl :
              argv.hardhatChainId === 250 ? argv.ftmRpcUrl :
                argv.hardhatChainId === 56 ? argv.bscRpcUrl :
                  argv.hardhatChainId === 8453 ? argv.baseRpcUrl :
                    undefined,
        blockNumber:
          argv.hardhatChainId === 1 ? argv.ethForkBlock !== 0 ? argv.ethForkBlock : undefined :
            argv.hardhatChainId === 137 ? argv.maticForkBlock !== 0 ? argv.maticForkBlock : undefined :
              argv.hardhatChainId === 250 ? argv.ftmForkBlock !== 0 ? argv.ftmForkBlock : undefined :
                argv.hardhatChainId === 56 ? argv.bscForkBlock !== 0 ? argv.bscForkBlock : undefined :
                  undefined
      } : undefined,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        accountsBalance: "100000000000000000000000000000"
      },
      loggingEnabled: argv.loggingEnabled,
    },
    ftm: {
      url: argv.ftmRpcUrl || '',
      timeout: 99999,
      chainId: 250,
      gas: 10_000_000,
      // gasPrice: 100_000_000_000,
      // gasMultiplier: 2,
      accounts: [argv.privateKey],
    },
    matic: {
      url: argv.maticRpcUrl || '',
      timeout: 99999,
      chainId: 137,
      gas: 12_000_000,
      // gasPrice: 50_000_000_000,
      // gasMultiplier: 1.3,
      accounts: [argv.privateKey],
    },
    eth: {
      url: argv.ethRpcUrl || '',
      chainId: 1,
      accounts: [argv.privateKey],
    },
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      chainId: 80001,
      accounts: [argv.privateKey],
    },
    ropsten: {
      url: "https://ropsten.infura.io/v3/" + argv.infuraKey,
      chainId: 3,
      gas: 8_000_000,
      accounts: [argv.privateKey],
    },
    rinkeby: {
      url: "https://rinkeby.infura.io/v3/" + argv.infuraKey,
      chainId: 4,
      gas: 8_000_000,
      gasPrice: 1_100_000_000,
      accounts: [argv.privateKey],
    },
    bsc: {
      url: argv.bscRpcUrl,
      timeout: 99999,
      chainId: 56,
      // gas: 19_000_000,
      // gasPrice: 100_000_000_000,
      // gasMultiplier: 1.3,
      accounts: [argv.privateKey],
    },
    zktest: {
      url: 'https://public.zkevm-test.net:2083',
      timeout: 99999,
      chainId: 1402,
      // gas: 19_000_000,
      // gasPrice: 100_000_000_000,
      // gasMultiplier: 1.3,
      accounts: [argv.privateKey],
    },
    goerli: {
      url: argv.goerliRpcUrl || '',
      chainId: 5,
      // gasPrice: 5_000_000_000,
      accounts: [argv.privateKey],
    },
    sepolia: {
      url: argv.sepoliaRpcUrl || '',
      chainId: 11155111,
      accounts: [argv.privateKey],
    },
    tetu: {
      url: 'https://tetu-node.io',
      chainId: 778877,
      accounts: [argv.privateKey],
    },
    custom: {
      url: "http://localhost:8545",
      chainId: 778877,
      accounts: [argv.privateKey],
    },
    baobab: {
      url: "https://api.baobab.klaytn.net:8651",
      chainId: 1001,
      accounts: [argv.privateKey],
    },
    skale_test: {
      // https://staging-fast-active-bellatrix.explorer.staging-v3.skalenodes.com/
      // https://staging-v3.skalenodes.com/fs/staging-fast-active-bellatrix
      // https://staging-v3.skalenodes.com/#/chains/staging-fast-active-bellatrix
      url: "https://staging-v3.skalenodes.com/v1/staging-fast-active-bellatrix",
      chainId: 1351057110,
      accounts: [argv.privateKey],
    },
    imm_test: {
      chainId: 13472,
      url: "https://rpc.testnet.immutable.com",
      accounts: [argv.privateKey],
    },
    base: {
      url: argv.baseRpcUrl || '',
      chainId: 8453,
      // gas: 50_000_000_000,
      accounts: [argv.privateKey],
    },
    op_sepolia: {
      chainId: 11155420,
      url: argv.sepoliaOpRpcUrl || '',
      accounts: [argv.privateKey],
      verify: {
        etherscan: {
          apiKey: argv.networkScanKeyOpSepolia
        }
      }
    },
    sonict: {
      chainId: 64165,
      url: 'https://rpc.sonic.fantom.network/',
      accounts: [argv.privateKey],
    },
    real: {
      chainId: 111188,
      url: argv.realRpcUrl || 'https://real.drpc.org',
      accounts: [argv.privateKey],
      verify: {
        etherscan: {
          apiKey: 'any'
        }
      }
    },
  },
  etherscan: {
    //  https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#multiple-api-keys-and-alternative-block-explorers
    apiKey: {
      mainnet: argv.networkScanKey,
      sepolia: argv.networkScanKey,
      polygon: argv.networkScanKeyMatic || argv.networkScanKey,
      polygonMumbai: argv.networkScanKeyMatic || argv.networkScanKey,
      opera: argv.networkScanKeyFtm || argv.networkScanKey,
      bsc: argv.networkScanKeyBsc || argv.networkScanKey,
      skale_test: 'any',
      imm_test: 'any',
      real: 'any',
      sonict: 'lore-public',
      base: argv.networkScanKeyBase,
      op_sepolia: argv.networkScanKeyOpSepolia,
    },
    customChains: [
      {
        network: "skale_test",
        chainId: 1351057110,
        urls: {
          apiURL: "https://staging-fast-active-bellatrix.explorer.staging-v3.skalenodes.com/api",
          browserURL: "https://staging-fast-active-bellatrix.explorer.staging-v3.skalenodes.com"
        }
      },
      {
        network: "imm_test",
        chainId: 13472,
        urls: {
          apiURL: "https://explorer.testnet.immutable.com/api",
          browserURL: "https://explorer.testnet.immutable.com"
        }
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "op_sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/"
        }
      },
      {
        network: "sonict",
        chainId: 64165,
        urls: {
          apiURL: " https://api.lorescan.com/64165",
          browserURL: "https://sonicscan.io/"
        }
      },
      {
        network: "real",
        chainId: 111188,
        urls: {
          apiURL: "https://explorer.re.al/api",
          browserURL: "https://explorer.re.al/"
        }
      },
    ]
  },
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 150,
          }
        }
      },
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 9999999999
  },
  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: false,
    except: ['contracts/third_party', 'contracts/test']
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: false,
    currency: 'USD',
    gasPrice: 21
  },
  typechain: {
    outDir: "typechain",
  },
  abiExporter: {
    path: './abi',
    runOnCompile: false,
    spacing: 2,
    pretty: false,
  }
};
