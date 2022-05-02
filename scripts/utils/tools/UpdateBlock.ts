import {fetchJson} from "ethers/lib/utils";
import * as fs from "fs";

const _getBlockUrl = 'https://api.polygonscan.com/api?module=proxy&action=eth_blockNumber';
const _envFilename = '.env'
const _envParamName = 'TETU_MATIC_FORK_BLOCK';

async function updateBlockNumber(url: string, envFilename: string, envParamName: string) {
  const blockData = await fetchJson({url});
  const blockNumber = Number(blockData.result) - 32; // hardhat needs block that has at least 32 confirmations
  replaceParamInEnvFile(envFilename, envParamName, blockNumber.toString());
  console.log(_envParamName, 'replaced to', blockNumber, 'in file', envFilename);
}

function replaceParamInEnvFile(envFileName: string,envParamName: string, newValue: string) {
  const envContent = fs.readFileSync(envFileName).toString();
  const pattern = new RegExp(`^${envParamName}=.+$`, 'm');
  const newContent = envContent.replace(pattern, envParamName+'='+newValue);
  fs.writeFileSync(envFileName, newContent);
}

updateBlockNumber(_getBlockUrl, _envFilename, _envParamName).then();
