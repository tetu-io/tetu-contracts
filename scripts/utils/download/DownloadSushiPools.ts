import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {IMiniChefV2, IOracleMatic, IRewarder, IUniswapV2Pair, SmartVault} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {Addresses} from "../../../addresses";
import {VaultUtils} from "../../../test/VaultUtils";


async function downloadSushi() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const chef = await DeployerUtils.connectInterface(signer, 'IMiniChefV2', MaticAddresses.SUSHI_MINISHEFV2) as IMiniChefV2;

  const oracle = await DeployerUtils.connectInterface(signer, 'IOracleMatic', Addresses.ORACLE) as IOracleMatic;

  const poolLength = (await chef.poolLength()).toNumber();
  console.log('length', poolLength);

  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '3') {
      continue;
    }
    underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    if (vInfo.active) {
      const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
      currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.psVault));
    }
  }

  const sushiPerSecond = await chef.sushiPerSecond();
  const totalAllocPoint = await chef.totalAllocPoint();
  const sushiPrice = await oracle.getPrice(MaticAddresses.SUSHI_TOKEN);
  console.log('sushi price', utils.formatUnits(sushiPrice));
  const maticPrice = await oracle.getPrice(MaticAddresses.WMATIC_TOKEN);
  console.log('maticPrice', utils.formatUnits(maticPrice));

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, alloc, sushiWeekRewardUsd, maticWeekRewardUsd, weekRewardUsd, tvlUsd, apr, currentRewards, vault \n';
  for (let i = 0; i < poolLength; i++) {
    if (i === 26) {
      continue;
    }
    const lp = await chef.lpToken(i);

    // const status = underlyingStatuses.get(lp.toLowerCase());
    // if (!status) {
    //   continue;
    // }
    console.log('id', i);
    const poolInfo = await chef.poolInfo(i);
    const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair
    const token0 = await lpContract.token0();
    const token1 = await lpContract.token1();

    const sushiAllocPoint = poolInfo[2];
    if (sushiAllocPoint.toNumber() === 0) {
      continue;
    }
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

    const token0Name = await TokenUtils.tokenSymbol(token0);
    const token1Name = await TokenUtils.tokenSymbol(token1);
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
      apr.toFixed(0) + ',' +
      currentRewards.get(lp.toLowerCase()) + ',' +
      underlyingToVault.get(lp.toLowerCase())
    ;
    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/sushi_pools.csv', infos, 'utf8');
  console.log('done');
}

downloadSushi()
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
