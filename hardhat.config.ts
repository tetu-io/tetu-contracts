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
import "@tenderly/hardhat-tenderly"
import {Secrets} from "./secrets";

dotEnvConfig();


export default {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 137,
      forking: {
        url: Secrets.maticRpcUrl,
      },
      accounts: [
        {
          privateKey: "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e", // random account
          balance: "1000000000000000000000000000",
        },
        {
          privateKey: "72d01b39db439c2c5b89f20013298079161cf0acfbd8b9aec933810439d8e83f", // random account
          balance: "1000000000000000000000000000",
        },
        {
          privateKey: "0aa11e3181585907868e05ac1c4c5adb3bcdb5cbf06a1b82e92cd82318debe3d", // random account
          balance: "1000000000000000000000000000",
        },
        {
          privateKey: "2fa47ef2cc8a29842081ce03948d4039538a320068cad021036ffd8accec879d", // random account
          balance: "1000000000000000000000000000",
        }
      ],
    },
    matic: {
      url: Secrets.maticRpcUrl,
      chainId: 137,
    },
    mumbai: {
      url: "https://polygon-mumbai.infura.io/v3/" + Secrets.infuraKey,
      chainId: 80001,
      gasPrice: 1,
      accounts: [Secrets.mumbaiPrivateKey],
    },
    ropsten: {
      url: "https://ropsten.infura.io/v3/" + Secrets.infuraKey,
      chainId: 3,
      gas: 8_000_000,
      accounts: [
        Secrets.ropstenPrivateKey,
        Secrets.ropstenPrivateKey2,
        "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e" // random account
      ],
    },
    rinkeby: {
      url: "https://rinkeby.infura.io/v3/" + Secrets.infuraKey,
      chainId: 4,
      gas: 8_000_000,
      accounts: [
        Secrets.ropstenPrivateKey,
        Secrets.ropstenPrivateKey2,
        "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e" // random account
      ],
    },
  },
  etherscan: {
    apiKey: Secrets.getNetworkScanKey()
  },
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
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
    runOnCompile: true,
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
  tenderly: {
    project: "",
    username: "",
  },
};
