import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {ERC20, IFossilFarms, IUniswapV2Pair, PriceCalculator} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();

  const chef = await DeployerUtils.connectInterface(signer, 'IFossilFarms', MaticAddresses.DINO_MASTERCHEF) as IFossilFarms;

  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const poolLength = (await chef.poolLength()).toNumber();
  console.log('length', poolLength);

  const rewardPerBlock = await chef.dinoPerBlock();
  const totalAllocPoint = await chef.totalAllocPoint();
  const rewardPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.DINO_TOKEN);
  console.log('dino price', utils.formatUnits(rewardPrice));

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, alloc, weekRewardUsd, tvlUsd, apr \n';
  for (let i = 0; i < poolLength; i++) {
    const poolInfo = await chef.poolInfo(i);
    const lp = poolInfo[0];
    const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair

    const allocPoint = poolInfo[1];
    const currentBlock = await web3.eth.getBlockNumber();
    const duration = currentBlock - poolInfo[2].toNumber();
    console.log('duration', duration, currentBlock, poolInfo[2].toNumber());
    const weekRewardUsd = computeWeekReward(duration, rewardPerBlock, allocPoint, totalAllocPoint, rewardPrice);
    console.log('weekRewardUsd', weekRewardUsd);

    const lpPrice = await priceCalculator.getPriceWithDefaultOutput(lp);
    const tvl = await lpContract.balanceOf(chef.address);
    const tvlUsd = utils.formatUnits(tvl.mul(lpPrice).div(1e9).div(1e9));

    const apr = ((weekRewardUsd / +tvlUsd) / 7) * 365 * 100;

    let token0: string = '';
    let token1: string = '';
    let token0Name: string = '';
    let token1Name: string = '';

    try {
      const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      token0 = await lpContract.token0();
      token1 = await lpContract.token1();
      token0Name = await Erc20Utils.tokenSymbol(token0);
      token1Name = await Erc20Utils.tokenSymbol(token1);
    } catch (e) {
    }

    if (token0 === '') {
      const token = await DeployerUtils.connectInterface(signer, 'ERC20', lp) as ERC20;
      token0Name = await token.symbol();
    }

    const data = i + ',' +
        'DINO_' + token0Name + (token1Name ? '_' + token1Name : '') + ',' +
        lp + ',' +
        token0 + ',' +
        token0Name + ',' +
        token1 + ',' +
        token1Name + ',' +
        poolInfo[1] + ',' +
        weekRewardUsd.toFixed() + ',' +
        (+tvlUsd).toFixed() + ',' +
        apr.toFixed(0)
    ;
    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  await writeFileSync('./tmp/dino_pools.csv', infos, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

function computeWeekReward(
    block: number,
    tokenPerBlock: BigNumber,
    allocPoint: BigNumber,
    totalAllocPoint: BigNumber,
    tokenPrice: BigNumber,
    averageBlockTime = 5
): number {
  const reward = BigNumber.from(block).mul(tokenPerBlock).mul(allocPoint).div(totalAllocPoint);
  const timeWeekRate = (60 * 60 * 24 * 7) / (block * averageBlockTime);
  const rewardForWeek = +utils.formatUnits(reward) * timeWeekRate;
  return +utils.formatUnits(tokenPrice) * rewardForWeek;
}
