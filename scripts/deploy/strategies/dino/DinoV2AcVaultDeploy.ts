import {McLpStrategyDeployer} from "../McLpStrategyDeployer";
import {readFileSync} from "fs";

async function main() {

  const infos = readFileSync('scripts/utils/download/data/dino_pools.csv', 'utf8').split(/\r?\n/);

  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      continue;
    }

    console.log('strat', idx, lpName);

    await McLpStrategyDeployer.deploy(
      lpAddress,
      +idx,
      'DINO_V2',
      'StrategyDinoSwapV2LpAc',
      'contracts/strategies/matic/dino/StrategyDinoSwapV2LpAc.sol:StrategyDinoSwapV2LpAc'
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
