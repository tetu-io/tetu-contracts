import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

import fetch from "node-fetch";
import {parseUnits} from "ethers/lib/utils";
import feeTokensJson  from '../../../balancer-sor/test/api/data/FeeOnTransferTokens.json';
import fs from "fs";
import {TokenUtils} from "../../test/TokenUtils";
const feeTokens = (feeTokensJson as IFeeTokens);

interface ITokenData {
  address: string;
  decimals: number;
  symbol: string;
}

interface IFeeTokenData {
  address: string;
  decimals: number;
  symbol: string;
  fee: string;
}

interface IFeeTokens {
  [address: string]: IFeeTokenData;
}

let signer: SignerWithAddress;
let core;

// function isNumericString(str: string) {
//   if (typeof str !== "string") return false // we only process strings!
//   return !isNaN(Number(str)) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
//       !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
// }

async function fetchFeeOnTransferTokens() {

  signer = (await ethers.getSigners())[0];
  core = await DeployerUtils.getCoreAddresses();

  const TRANSFER_AMOUNT_EXCEEDS_BALANCE = 'transfer amount exceeds balance';
  const feeTokensFilename = '../balancer-sor/test/api/data/FeeOnTransferTokens.json';

  const url = 'https://ms.tetu.io/tokens';
  const response = await fetch(url);
  const tokens = Object.values(await response.json()) as ITokenData[];
  const timeStart = (new Date()).getTime();
  const wrongHolders = [];
  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const feeToken = feeTokens[token.address];
    // we skip tokens with numeric (not error string) fee
    const possibleWrongHolder = feeToken?.fee?.includes(TRANSFER_AMOUNT_EXCEEDS_BALANCE)
    if (feeToken && !possibleWrongHolder /*&& isNumericString(feeToken.fee)*/) {
      console.log('already in list:', token.symbol, feeTokens[token.address].fee)
      continue;
    }

    console.log('--------------');
    console.log(token.symbol, token.address);

    let fee;
    let amount;
    let balanceBefore;

    try {
      amount = parseUnits('0.01', token.decimals);
      balanceBefore = await TokenUtils.balanceOf(token.address, signer.address);

      try {
        await TokenUtils.getToken(token.address, signer.address, amount, false);
      } catch (e) {
        await TokenUtils.getToken(token.address, signer.address, amount, true);
      }

      const balance = await TokenUtils.balanceOf(token.address, signer.address);
      const received = balance.sub(balanceBefore);
      const diff = amount.sub(received);
      fee = diff.mul(10000).div(amount).toString();

    } catch (e) {
      const message = (e as Error).message
      console.warn(message);
      fee = message;
    }

    console.log('fee', fee);
    token.decimals = parseInt(token.decimals.toString(), undefined);

    const wrongHolder = fee.includes(TRANSFER_AMOUNT_EXCEEDS_BALANCE)
    // do not put tokens with possible wrong token holder
    if (wrongHolder) {
      delete feeTokens[token.address];
      wrongHolders.push({symbol: token.symbol, address: token.address});
    } else
      feeTokens[token.address] = {...token, fee}

    const jsonText = JSON.stringify(feeTokens, undefined, '\t');
    fs.writeFile(feeTokensFilename, jsonText, function (err) {
      if (err) return console.error('Error:', err);
      else console.log('saved to:', feeTokensFilename);
    });

    // ETA
    const left = tokens.length - i;
    const now = (new Date()).getTime();
    const estimatedTimeEnd = (now - timeStart) / (i+1) * left;

    function padTo2Digits(num: number) {
      return num.toString().padStart(2, '0');
    }
    let seconds = Math.floor(estimatedTimeEnd / 1000);
    let minutes = Math.floor(seconds / 60);
    const  hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    console.log('estimatedTimeEnd',
        `${padTo2Digits(hours)}:${padTo2Digits(minutes)}:${padTo2Digits(seconds)}`);


  }
  console.log('wrongHolders', wrongHolders);
}

fetchFeeOnTransferTokens().then()
