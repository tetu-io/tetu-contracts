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
  const txHash = '0x471c157e4258c4cde0f7046de5f25c197c7a110d469c3548f7be352b156192de'.trim();
  let response: AxiosResponse<any>;
  try {
    response = await axios.post(Secrets.maticRpcUrl,
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
  const result = response.data['result'];
  console.log('response', result);

  const nonce = web3.utils.hexToNumber(result['nonce']);
  console.log('nonce', nonce);

  const gasPrice = await web3.eth.getGasPrice();
  const gasPriceAdjusted = web3.utils.toBN(gasPrice).mul(web3.utils.toBN(3)).toString();

  console.log('gas', gasPrice, gasPriceAdjusted);

  const tx = new EthereumTx(
      {
        nonce: web3.utils.numberToHex(nonce),
        to: result['to'],
        data: result['input'],
        gasPrice: web3.utils.numberToHex(gasPriceAdjusted),
        gasLimit: web3.utils.numberToHex(10_000_000),
      },
      {common: MATIC_CHAIN});


  tx.sign(Buffer.from(Secrets.maticPrivateKey3, 'hex'));

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
