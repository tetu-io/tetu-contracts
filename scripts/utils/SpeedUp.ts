import {ethers, web3} from "hardhat";
import axios, {AxiosResponse} from "axios";
import Common from "ethereumjs-common";
import {Secrets} from "../../secrets";

const EthereumTx = require('ethereumjs-tx').Transaction

const MATIC_CHAIN = Common.forCustomChain(
    'mainnet', {
      name: 'matic',
      networkId: 137,
      chainId: 137
    },
    'petersburg'
);

async function main() {
  const signer = (await ethers.getSigners())[0];

  const url = 'https://matic-mainnet.chainstacklabs.com';

  const data = {
    id: 1,
    jsonrpc: "2.0",
    method: "eth_getRawTransactionByHash",
    params: ["0x684ac31ac9fa8c052b38357219b50f68eaa146fa490f5fa2fe6cd5d5f51552ec"]
  };

  let response: AxiosResponse<any>;
  try {
    response = await axios.post(url,
        '{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["0x684ac31ac9fa8c052b38357219b50f68eaa146fa490f5fa2fe6cd5d5f51552ec"],"id":1}',
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
  const result = response.data['result'];
  console.log('response', result);

  // web3.eth.

  const nonce = web3.utils.hexToNumber(result['nonce']);
  console.log('nonce', nonce);

  const gasPrice = await web3.eth.getGasPrice();
  const gasPriceAdjusted = web3.utils.toBN(gasPrice).sub(
      web3.utils.toBN(gasPrice).mul(web3.utils.toBN(2))
  ).toString();

  const tx = new EthereumTx(
      {
        nonce: nonce + 1,
        to: result['to'],
        data: result['input'],
        gasPrice: web3.utils.numberToHex(gasPriceAdjusted),
        gasLimit: web3.utils.numberToHex(10_000_000),
      },
      {common: MATIC_CHAIN});


  tx.sign(Buffer.from(Secrets.maticPrivateKey, 'hex'));

  const txRaw = '0x' + tx.serialize().toString('hex');

  // await web3.eth.sendSignedTransaction(txRaw, (err, res) => {
  //   console.log('result', err, res);
  // });
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
