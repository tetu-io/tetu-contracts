import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {IMiniChefV2, IOracleMatic, IRewarder, IUniswapV2Pair} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {Addresses} from "../../../addresses";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const chef = await DeployerUtils.connectInterface(signer, 'IMiniChefV2', MaticAddresses.SUSHI_MINISHEFV2) as IMiniChefV2;

  const oracle = await DeployerUtils.connectInterface(signer, 'IOracleMatic', Addresses.ORACLE) as IOracleMatic;

  const poolLength = (await chef.poolLength()).toNumber();
  console.log('length', poolLength);

  const sushiPerSecond = await chef.sushiPerSecond();
  const totalAllocPoint = await chef.totalAllocPoint();
  const sushiPrice = await oracle.getPrice(MaticAddresses.SUSHI_TOKEN);
  console.log('sushi price', utils.formatUnits(sushiPrice));
  const maticPrice = await oracle.getPrice(MaticAddresses.WMATIC_TOKEN);
  console.log('maticPrice', utils.formatUnits(maticPrice));

  const addEvent = web3.eth.abi.encodeEventSignature({
    name: 'LogPoolAddition',
    type: 'event',
    inputs: [{
      type: 'uint256',
      name: 'pid'
    }, {
      type: 'uint256',
      name: 'allocPoint'
    }]
  });

  const setEvent = web3.eth.abi.encodeEventSignature({
    name: 'LogSetPool',
    type: 'event',
    inputs: [{
      type: 'uint256',
      name: 'pid'
    }, {
      type: 'uint256',
      name: 'allocPoint'
    }]
  });
  console.log('addEvent', addEvent);
  console.log('setEvent', setEvent);

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, alloc, sushiWeekRewardUsd, maticWeekRewardUsd, weekRewardUsd, tvlUsd, apr \n';
  for (let i = 0; i < poolLength; i++) {
    const lp = await chef.lpToken(i);
    const poolInfo = await chef.poolInfo(i);
    const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair
    const token0 = await lpContract.token0();
    const token1 = await lpContract.token1();

    const sushiAllocPoint = poolInfo[2];
    const sushiDuration = +(((Date.now() / 1000) - poolInfo[1].toNumber()).toFixed(0));

    const sushiWeekRewardUsd = computeWeekReward(sushiDuration, sushiPerSecond, sushiAllocPoint, totalAllocPoint, sushiPrice);
    console.log('sushiWeekRewardUsd', sushiWeekRewardUsd);

    const rewarder = await chef.rewarder(i);
    const rewarderContract = await DeployerUtils.connectInterface(signer, 'IRewarder', rewarder) as IRewarder;

    const rewarderPoolInfo = await rewarderContract.poolInfo(i);
    // can be block rewarder
    const maticPerSec = await rewarderContract.rewardPerSecond();
    // just hope that the same as chef
    // otherwise need to parse all events
    const maticTotalAllocPoint = totalAllocPoint;
    const maticDuration = +(((Date.now() / 1000) - rewarderPoolInfo[1].toNumber()).toFixed(0));
    const maticWeekRewardUsd = computeWeekReward(maticDuration, maticPerSec, rewarderPoolInfo[2], maticTotalAllocPoint, maticPrice);
    console.log('maticWeekRewardUsd', maticWeekRewardUsd);

    const allRewards = maticWeekRewardUsd + sushiWeekRewardUsd;
    const lpPrice = await oracle.getPrice(lp);
    const tvl = await lpContract.balanceOf(chef.address);
    const tvlUsd = utils.formatUnits(tvl.mul(lpPrice).div(1e9).div(1e9));

    const apr = ((allRewards / +tvlUsd) / 7) * 365 * 100;

    const token0Name = await Erc20Utils.tokenSymbol(token0);
    const token1Name = await Erc20Utils.tokenSymbol(token1);
    const data = i + ',' +
        'SUSHI_' + token0Name + '_' + token1Name + ',' +
        lp + ',' +
        token0 + ',' +
        token0Name + ',' +
        token1 + ',' +
        token1Name + ',' +
        sushiAllocPoint.toNumber() + ',' +
        sushiWeekRewardUsd.toFixed(0) + ',' +
        maticWeekRewardUsd.toFixed(0) + ',' +
        allRewards.toFixed(0) + ',' +
        (+tvlUsd).toFixed(0) + ',' +
        apr.toFixed(0)
    ;
    console.log(data);
    infos += data + '\n';
  }


  // console.log('data', data);
  await writeFileSync('./tmp/sushi_pools.csv', infos, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

function computeWeekReward(
    time: number,
    sushiPerSecond: BigNumber,
    allocPoint: BigNumber,
    totalAllocPoint: BigNumber,
    sushiPrice: BigNumber
): number {
  const sushiReward = BigNumber.from(time).mul(sushiPerSecond).mul(allocPoint).div(totalAllocPoint);
  const timeWeekRate = (60 * 60 * 24 * 7) / time;
  const sushiRewardForWeek = +utils.formatUnits(sushiReward) * timeWeekRate;
  return +utils.formatUnits(sushiPrice) * sushiRewardForWeek;
}
