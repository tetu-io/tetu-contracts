import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  AaveMaiBalStrategyBase__factory,
  ContractUtils,
  MaiStablecoinPipe__factory,
  SmartVault,
  SmartVault__factory
} from "../../../typechain";
import {writeFileSync} from "fs";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Web3Utils} from "../tools/Web3Utils";

const forParsing = [
  "0xf203b855b4303985b3dd3f35a9227828cc8cb009".toLowerCase(),
];

const EVENT_REBALANCE = '0xc257294ad49c215e1a248c91a86bc2612b4781d9677285cc9c14498f485ef122';
const EVENT_DEPOSIT = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';
const START_BLOCK = 22553264;
const STEP = 2000;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const currentBlock = await web3.eth.getBlockNumber();
  console.log('current block', currentBlock);

  const strategy = await SmartVault__factory.connect('0xf203b855b4303985b3dd3f35a9227828cc8cb009', signer).strategy();
  console.log('strategy', strategy);
  const pipe = await AaveMaiBalStrategyBase__factory.connect(strategy, signer).pipes(2)
  console.log('pipe', pipe)
  // MaiStablecoinPipe__factory.connect(pipe, signer);

  const logs = await Web3Utils.parseLogs(
    [pipe],
    [EVENT_REBALANCE],
    START_BLOCK,
    currentBlock
  );

  console.log('logs', logs.length);


  for (const log of logs) {
    const logParsed = MaiStablecoinPipe__factory.createInterface().parseLog(log);
    console.log(logParsed);
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


async function collectPs(
  usersTotalAll: Map<string, Set<string>>,
  psAdr: string,
  vaults: string[],
  signer: SignerWithAddress,
  utilsAdr: string
): Promise<string> {

  let data = '';
  const exclude = new Set<string>(vaults);

  const contractUtils = await DeployerUtils.connectInterface(signer, 'ContractUtils', utilsAdr) as ContractUtils;
  const psContr = await DeployerUtils.connectInterface(signer, 'SmartVault', psAdr) as SmartVault;

  const ppfs = +utils.formatUnits(await psContr.getPricePerFullShare());

  const usersBatches = [];
  const batchSize = 150;
  let i = 0;
  let batch = [];
  const usersTotal = usersTotalAll.get(psAdr) as Set<string>;
  for (const user of Array.from(usersTotal.keys())) {
    if (exclude.has(user) || !user || !psAdr) {
      continue;
    }

    batch.push(user);

    i++;
    if (i % batchSize === 0 || i === usersTotal.size) {
      usersBatches.push(batch);
      batch = [];
      i = 0;
    }
  }

  for (const _batch of usersBatches) {

    const balances = await contractUtils.erc20BalancesForAddresses(psAdr, _batch);

    for (let j = 0; j < balances.length; j++) {

      const toClaim = +utils.formatUnits(balances[j]);
      if (toClaim > 0) {
        data += `TETU_PS,${psAdr},${_batch[j]},${toClaim * ppfs}\n`;
      }
    }

  }


  writeFileSync(`./tmp/stats/to_claim_ps.txt`, data, 'utf8');

  return data;
}
