import {web3} from "hardhat";
import axios, {AxiosResponse} from "axios";
import Common from "ethereumjs-common";
import {config as dotEnvConfig} from "dotenv";
import {utils} from "ethers";

// tslint:disable-next-line:no-var-requires
const EthereumTx = require('ethereumjs-tx').Transaction

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    maticRpcUrl: {
      type: "string",
    },
    speedUpPrivateKey: {
      type: "string",
    },
    speedUpTx: {
      type: "string",
    },
    speedUpGasPrice: {
      type: "string",
      default: utils.parseUnits(333 + '', 9).toString()
    }
  }).argv;

const MATIC_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'matic',
    networkId: 137,
    chainId: 137
  },
  'petersburg'
);

async function main() {
  const txHash = argv.speedUpTx.trim();
  let response: AxiosResponse;
  try {
    response = await axios.post(argv.maticRpcUrl,
      `{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["${txHash}"],"id":1}`,
      {
        headers: {
          'Content-Type': 'application/json',
        }
      },
    );
  } catch (e) {
    console.error('error request', e);
    return;
  }
  const result = response.data.result;
  console.log('response', txHash, result);

  const nonce = web3.utils.hexToNumber(result.nonce);
  console.log('nonce', nonce);

  const gasPrice = await web3.eth.getGasPrice();
  const gasPriceAdjusted = web3.utils.toBN(gasPrice).mul(web3.utils.toBN(3)).toString();

  console.log('gas', gasPrice, gasPriceAdjusted);

  const tx = new EthereumTx(
    {
      nonce: web3.utils.numberToHex(nonce),
      to: result.to,
      data: result.input,
      gasPrice: web3.utils.numberToHex(argv.speedUpGasPrice),
      gasLimit: web3.utils.numberToHex(19_000_000),
    },
    {common: MATIC_CHAIN});


  tx.sign(Buffer.from(argv.speedUpPrivateKey, 'hex'));

  const txRaw = '0x' + tx.serialize().toString('hex');

  await web3.eth.sendSignedTransaction(txRaw, (err, res) => {
    console.log('result', err, res);
  });


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
