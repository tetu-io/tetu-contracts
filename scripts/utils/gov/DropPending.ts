import {ethers, web3} from "hardhat";
import {utils} from "ethers";
import Common from "ethereumjs-common";
import {config as dotEnvConfig} from "dotenv";
import {Misc} from "../tools/Misc";

// tslint:disable-next-line:no-var-requires
const EthereumTx = require('ethereumjs-tx').Transaction

const MATIC_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'matic',
    networkId: 137,
    chainId: 137
  },
  'petersburg'
);

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    speedUpPrivateKey: {
      type: "string",
    },
    speedUpGasPrice: {
      type: "string",
      default: utils.parseUnits(333 + '', 9).toString()
    }
  }).argv;

async function main() {
  const signer = new ethers.Wallet(argv.speedUpPrivateKey, ethers.provider);
  console.log('signer', signer.address);

  while (true) {
    const nonce = await web3.eth.getTransactionCount(signer.address)
    console.log('nonce', nonce.toString());
    const nonce1 = await web3.eth.getTransactionCount(signer.address, 'pending')
    console.log('pending nonce', nonce1.toString());
    if (nonce1 === nonce) {
      console.log('NO PENDING');
      return;
    }

    const chain = await Misc.getChainConfig()
    const tx = new EthereumTx(
      {
        nonce: web3.utils.numberToHex(nonce),
        from: signer.address,
        to: signer.address,
        // data: result.input,
        gasPrice: web3.utils.numberToHex(utils.parseUnits(1000 + '', 9).toString()),
        gasLimit: web3.utils.numberToHex(1_000_000),
      },
      {common: chain});


    tx.sign(Buffer.from(argv.speedUpPrivateKey, 'hex'));

    const txRaw = '0x' + tx.serialize().toString('hex');

    await web3.eth.sendSignedTransaction(txRaw, (err, res) => {
      console.log('result', err, res);
    });
    // break
  }

}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
