import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IOracleMatic,
  IStakingRewardsFactory,
  IUniswapV2Pair,
  SNXRewardInterface
} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {utils} from "ethers";
import {Addresses} from "../../../addresses";

const exclude = new Set<string>([]);


async function main() {
  const signer = (await ethers.getSigners())[0];

  const factory = await DeployerUtils.connectInterface(signer, 'IStakingRewardsFactory', MaticAddresses.QUICK_STAKING_FACTORY) as IStakingRewardsFactory;
  console.log('rewardsToken', await factory.rewardsToken());

  const oracle = await DeployerUtils.connectInterface(signer, 'IOracleMatic', Addresses.ORACLE) as IOracleMatic;

  const poolLength = 10000;
  const quickPrice = await oracle.getPrice(MaticAddresses.QUICK_TOKEN);
  console.log('quickPrice', utils.formatUnits(quickPrice));

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, pool, rewardAmount, duration, weekRewardUsd, tvlUsd, apr \n';
  for (let i = 0; i < poolLength; i++) {
    let lp;
    let token0: string = '';
    let token1: string = '';
    let token0Name: string = '';
    let token1Name: string = '';

    try {
      lp = await factory.stakingTokens(i);
    } catch (e) {
      console.log('looks like we dont have more lps', i);
      break;
    }

    try {
      const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      token0 = await lpContract.token0();
      token1 = await lpContract.token1();
      token0Name = await Erc20Utils.tokenSymbol(token0);
      token1Name = await Erc20Utils.tokenSymbol(token1);
    } catch (e) {
      console.error('cant fetch token names for ', lp);
      continue;
    }

    const info = await factory.stakingRewardsInfoByStakingToken(lp);
    // factory doesn't hold duration, suppose that it is a week
    const durationSec = 60 * 60 * 24 * 7;

    const poolContract = await DeployerUtils.connectInterface(signer, 'SNXRewardInterface', info[0]) as SNXRewardInterface;

    const rewardRate = await poolContract.rewardRate();
    const notifiedAmount = rewardRate.mul(durationSec);
    const notifiedAmountN = +utils.formatUnits(notifiedAmount);

    let durationDays = (durationSec) / 60 / 60 / 24;
    const weekDurationRatio = 7 / durationDays;
    let notifiedAmountUsd = notifiedAmountN * +utils.formatUnits(quickPrice);

    const finish = (await poolContract.periodFinish()).toNumber();
    const currentTime = Math.floor(Date.now() / 1000);

    if (finish < currentTime) {
      durationDays = 0
      notifiedAmountUsd = 0;
    }

    console.log('duration', durationDays);
    console.log('weekDurationRatio', weekDurationRatio);
    console.log('notifiedAmount', notifiedAmountN);

    const tvl = await poolContract.totalSupply();
    const underlyingPrice = await oracle.getPrice(lp);
    const tvlUsd = +utils.formatUnits(tvl) * +utils.formatUnits(underlyingPrice);

    const apr = ((notifiedAmountUsd / tvlUsd) / durationDays) * 365 * 100

    const data = i + ',' +
        'QUICK_' + token0Name + '_' + token1Name + ',' +
        lp + ',' +
        token0 + ',' +
        token0Name + ',' +
        token1 + ',' +
        token1Name + ',' +
        info[0] + ',' +
        notifiedAmountUsd.toFixed(2) + ',' +
        durationDays.toFixed(2) + ',' +
        (notifiedAmountUsd * weekDurationRatio).toFixed(2) + ',' +
        tvlUsd.toFixed(2) + ',' +
        apr.toFixed(2)
    ;
    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  await writeFileSync('./tmp/quick_pools.csv', infos, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
