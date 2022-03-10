import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, StrategyMarket__factory} from "../../../../typechain";
import {appendFileSync} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";

const splitters = [
  "0x26030c3e3790fF4e1236585f2650AE7da56a752C", // polygon usdc
];

let verified = false;

const alreadyDeployed = new Set<number>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  appendFileSync(`./tmp/deployed/MARKET_STRATS_SPLITTER.txt`, '-------------------\n', 'utf8');

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

    console.log('strat', idx, TokenUtils.tokenSymbol(tokenAddress));

    // ** CONFIG
    const controller = core.controller;
    const underlying = tokenAddress;
    const uName = await TokenUtils.tokenSymbol(underlying);
    const name = 'MARKET_' + uName;
    // *****************************

    const minTvl = 100_000;

    const pools = await DeployerUtils.deployImpermaxLikeStrategies(
        signer,
        controller,
        sAdr,
        underlying,
        'StrategyMarket',
        'scripts/utils/download/data/market.csv',
        minTvl,
        100_00
    );

    if (pools.length === 0) {
      console.log('No pools for ', name)
      continue
    }

    appendFileSync(`./tmp/deployed/MARKET_STRATS_SPLITTER.txt`, '---\n', 'utf8');

    for (const pool of pools) {
      const tCtr = StrategyMarket__factory.connect(pool, signer);
      const vaultAddress = await tCtr.vault();
      const poolAddress = await tCtr.pool();
      const buyBackRatio = await tCtr.buyBackRatio();
      const strategyArgs = [
        controller,
        vaultAddress,
        underlying,
        poolAddress,
        buyBackRatio
      ];
      if (!verified && (await ethers.provider.getNetwork()).name !== "hardhat") {
        await DeployerUtils.verifyWithContractName(pool, 'contracts/strategies/matic/market/StrategyMarket.sol:StrategyMarket', strategyArgs);
        verified = true;
      }
      const txt = `${name}:     splitter: ${sAdr}     strategy: ${pool}\n`;
      appendFileSync(`./tmp/deployed/MARKET_STRATS_SPLITTER.txt`, txt, 'utf8');
    }
  }
}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
