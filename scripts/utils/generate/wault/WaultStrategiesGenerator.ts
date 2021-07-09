import {mkdir, readFileSync, writeFileSync} from "fs";


async function main() {
  const templatePath = 'scripts/utils/generate/wault/wault_strat_template.sol';
  const templateSinglePath = 'scripts/utils/generate/wault/wault_strat_single_template.sol';
  const outputPath = 'tmp/wault_strats/';
  const infos = readFileSync('scripts/utils/generate/wault/wault_pools.csv', 'utf8').split(/\r?\n/);
  const template = readFileSync(templatePath, 'utf8');
  const templateSingle = readFileSync(templateSinglePath, 'utf8');

  mkdir(outputPath, {recursive: true}, (err) => {
    if (err) throw err;
  });

  infos.forEach(info => {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx' || strat[0] == '0' || !strat[1]) {
      console.log('skip', strat[0]);
      return;
    }
    console.log('strat', strat[0], strat[1]);
    const strategyName = 'StrategyWault_' + strat[4] + (strat[6] ? '_' + strat[6] : '');

    let output: string;
    if (strat[6]) {
      output = template;
    } else {
      output = templateSingle;
    }
    output = output.replace('${underlying_name}', strat[1]);
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
