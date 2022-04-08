import {config as dotEnvConfig} from "dotenv";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-solhint";
import '@openzeppelin/hardhat-upgrades';
import "@typechain/hardhat";
import "hardhat-docgen";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "hardhat-etherscan-abi";
import "solidity-coverage"

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    hardhatChainId: {
      type: "number",
      default: 80001
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
    infuraKey: {
      type: "string",
    },
    networkScanKey: {
      type: "string",
    },
    privateKey: {
      type: "string",
      default: "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e" // random account
    },
    maticForkBlock: {
      type: "number",
      default: 23945980
    },
    ftmForkBlock: {
      type: "number",
      default: 32100000
    },
  }).argv;

const alchemyurl=process.env.ALCHEMY_URL
export default {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: alchemyurl,
        blockNumber: 11095000,
      }
    },
    matic: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/" + process.env.KEY,
      chainId: 137,
      gasPrice: 1,
      accounts: [process.env.PRIVATE_KEY ]

    },
    mumbai: {
      url: "https://polygon-mumbai.g.alchemy.com/v2/" + process.env.KEY,
      chainId: 80001,
      gasPrice: 1,
      accounts: [process.env.PRIVATE_KEY ]
    },
    ropsten: {
      url: "https://eth-ropsten.alchemyapi.io/v2/" + process.env.KEY,
      chainId: 3,
      gasPrice: 1,
      accounts: [process.env.PRIVATE_KEY ]
    }
    }
};