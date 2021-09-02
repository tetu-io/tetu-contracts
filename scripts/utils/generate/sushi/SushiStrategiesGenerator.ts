import {readFileSync, writeFileSync} from "fs";


async function main() {
  const templatePath = 'scripts/utils/generate/sushi/sushi_strat_template.sol';
  const outputPath = 'tmp/sushi_strats/';
  const infos = readFileSync('scripts/utils/download/data/sushi_pools.csv', 'utf8').split(/\r?\n/);
  const template = readFileSync(templatePath, 'utf8');

  infos.forEach(info => {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx' || !strat[1]) {
      console.log('skip', strat[0]);
      return;
    }
    console.log('strat', strat[0], strat[1]);
    const strategyName = 'StrategySushi_' + strat[4] + '_' + strat[6];
    let output = template.replace('${underlying_name}', strat[1]);
    output = output.replace('${name}', strategyName);
    output = output.replace('${underlying}', strat[2]);
    output = output.replace('${token0}', strat[3]);
    output = output.replace('${token0_name}', strat[4]);
    output = output.replace('${token1}', strat[5]);
    output = output.replace('${token1_name}', strat[6]);
    output = output.replace('${pool_id}', strat[0]);

    writeFileSync(outputPath + strategyName + '.sol', output, 'utf8');
  });
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
