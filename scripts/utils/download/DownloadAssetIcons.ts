import {mkdir, readFileSync, writeFileSync} from "fs";
import axios, {AxiosResponse} from "axios";


async function main() {
  const templatePath = 'scripts/utils/generate/quick/quick_strat_template.sol';
  const outputPath = 'tmp/assets/matic/';
  const quickInfos = readFileSync('scripts/utils/download/data/quick_pools.csv', 'utf8').split(/\r?\n/);
  const sushiInfos = readFileSync('scripts/utils/download/data/sushi_pools.csv', 'utf8').split(/\r?\n/);
  const waultInfos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

  mkdir(outputPath, {recursive: true}, (err) => {
    if (err) throw err;
  });

  const assets = new Map<string, string>([
    ['0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a'.toLowerCase(), 'SUSHI']
  ]);
  const absent = new Map<string, string>();

  for (const info of quickInfos) {
    const strat = info.split(',');
    if (+strat[9] <= 0 || strat[0] === 'idx' || !strat[3]) {
      // console.log('skip', strat[0]);
      continue;
    }
    // console.log('strat', strat[0], strat[1]);
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];

    assets.set(token0.toLowerCase(), token0Name);
    assets.set(token1.toLowerCase(), token1Name);
  }

  for (const info of sushiInfos) {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx' || !strat[3]) {
      // console.log('skip', strat[0]);
      continue;
    }
    // console.log('strat', strat[0], strat[1]);
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];

    assets.set(token0.toLowerCase(), token0Name);
    assets.set(token1.toLowerCase(), token1Name);
  }

  for (const info of waultInfos) {
    const strat = info.split(',');
    if (+strat[7] <= 0 || strat[0] === 'idx' || strat[0] === '0' || !strat[1]) {
      console.log('skip', strat[0]);
      continue;
    }
    // console.log('strat', strat[0], strat[1]);
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];

    assets.set(token0.toLowerCase(), token0Name);
    if (token1) {
      assets.set(token1.toLowerCase(), token1Name);
    }
  }

  for (const address of Array.from(assets.keys())) {

    const name = assets.get(address) as string;

    const url = 'https://api.coingecko.com/api/v3/coins/polygon-pos/contract/' + address;

    let response: AxiosResponse;
    try {
      response = await axios.get(url);
    } catch (e) {
      // console.error('error request', address, name);
      absent.set(address, name);
      continue;
    }

    let imgUrl = response.data.image.large.toString() as string;
    console.log('imgUrl', name, address, imgUrl);

    if (imgUrl.indexOf('?') !== -1) {
      imgUrl = imgUrl.split('?')[0];
    }

    await downloadImage(imgUrl, outputPath, name);
  }

  for (const address of Array.from(absent.keys())) {
    console.log(address, absent.get(address));
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});


async function downloadImage(url: string, path: string, name: string) {
  const response = await axios.get(url, {responseType: 'arraybuffer'});

  const postfix = url.split('.')[url.split('.').length - 1];

  writeFileSync(path + name + '.' + postfix, Buffer.from(response.data));
}
