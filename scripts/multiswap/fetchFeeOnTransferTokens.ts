import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwap2,
} from "../../typechain";
import {ethers, network, config} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

import fetch from "node-fetch";
import {BigNumberish} from "ethers";
import {parseUnits} from "ethers/lib/utils";
import feeTokensJson  from './json/FeeOnTransferTokens.json';
import fs from "fs";
import {TokenUtils} from "../../test/TokenUtils";
const feeTokens = feeTokensJson as IFeeTokens;

// const {expect} = chai;
chai.use(chaiAsPromised);

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

async function fetchFeeOnTransferTokens() {

  signer = (await ethers.getSigners())[0];
  core = await DeployerUtils.getCoreAddresses();
  // usdc = await DeployerUtils.getUSDCAddress();

  const feeTokensFilename = 'scripts/multiswap/json/FeeOnTransferTokens.json';

  const url = 'https://ms.tetu.io/tokens';
  const response = await fetch(url);
  const tokens = Object.values(await response.json()) as ITokenData[];

  for (const token of tokens) {
    console.log('--------------');
    console.log(token.symbol, token.address);
    if (feeTokens[token.address]) {
      console.log(token.symbol, 'already in list:', feeTokens[token.address].fee)
      continue;
    }

    const amount = parseUnits('1', token.decimals);
    const balanceBefore = await TokenUtils.balanceOf(token.address, signer.address);
    let fee;

    try {
      await TokenUtils.getToken(token.address, signer.address, amount);
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

    feeTokens[token.address] = {...token, fee}

    const jsonText = JSON.stringify(feeTokens, undefined, '\t');
    fs.writeFile(feeTokensFilename, jsonText, function (err) {
      if (err) return console.error('Error:', err);
      else console.log('saved to:', feeTokensFilename);
    });

  }
}

fetchFeeOnTransferTokens().then()
