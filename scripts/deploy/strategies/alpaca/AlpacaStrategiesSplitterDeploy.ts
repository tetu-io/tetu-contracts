import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {
  ContractReader,
  IStrategy
} from "../../../../typechain";
import {appendFileSync, readFileSync} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";

const splitters = [
  "0xd289758e678e58cb93cdb1f871ce227ba1178e6f", // TETU_USDC
  "0x7055e850ae61fa3564352d7fb93aa27cb3b94b81", // TETU_WFTM
];

const alreadyDeployed = new Set<number>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  appendFileSync(`./tmp/deployed/ALPACA_STRATS_SPLITTER.txt`, '-------------------\n', 'utf8');

  for (const sAdr of splitters) {

    const idx = splitters.indexOf(sAdr);
    const tokenAddress = (await cReader.vaultUnderlying(sAdr)).toLowerCase();

    if (!tokenAddress) {
      console.log('skip', idx);
      continue;
    }

    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    console.log('strat', idx, await TokenUtils.tokenSymbol(tokenAddress));

    // ** CONFIG
    const controller = core.controller;
    const underlying = tokenAddress;
    const uName = await TokenUtils.tokenSymbol(underlying);
    const name = 'ALPACA_' + uName;
    // *****************************

    const infos = readFileSync('scripts/utils/download/data/alpaca_pools.csv', 'utf8').split(/\r?\n/);

    const strategies = [];

    for (const i of infos) {
      const info = i.split(',');
      const id = info[0];
      const tokenName = info[3];
      const tokenAdr = info[4];
      const poolAdr = info[2];

      if (id === 'idx' || !tokenAdr || underlying.toLowerCase() !== tokenAdr.toLowerCase()) {
        continue;
      }
      console.log('SubStrategy', id, tokenName);
      const strategyArgs = [
        controller,
        sAdr,
        tokenAdr,
        id,
        poolAdr,
      ];

      const deployedStart = await DeployerUtils.deployContract(
          signer,
          'StrategyAlpacaVault',
          ...strategyArgs
      ) as IStrategy;
      strategies.push(deployedStart.address);
      console.log(' ================ ALPACA STRATEGY DEPLOYED', strategies.length);
    }

    if (strategies.length === 0) {
      console.log('No strategies for ', name)
      continue
    }

    appendFileSync(`./tmp/deployed/ALPACA_STRATS_SPLITTER.txt`, '---\n', 'utf8');

    for (const strat of strategies) {
      const txt = `${name}:     splitter: ${sAdr}     strategy: ${strat}\n`;
      appendFileSync(`./tmp/deployed/ALPACA_STRATS_SPLITTER.txt`, txt, 'utf8');
    }
  }
}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
