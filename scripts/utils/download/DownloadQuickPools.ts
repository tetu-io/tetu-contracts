import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IOracleMatic,
  IStakingRewardsFactory,
  IUniswapV2Pair,
  SNXRewardInterface
} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {writeFileSync} from "fs";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {utils} from "ethers";
import {Addresses} from "../../../addresses";

const exclude = new Set<string>([]);


async function main() {
  const signer = (await ethers.getSigners())[0];

  const factory = await DeployerUtils.connectInterface(signer, 'IStakingRewardsFactory', '0x5eec262B05A57da9beb5FE96a34aa4eD0C5e029f') as IStakingRewardsFactory;
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

    const poolContract = await DeployerUtils.connectInterface(signer, 'SNXRewardInterface', info[0]) as SNXRewardInterface;
    const finish = (await poolContract.periodFinish()).toNumber();
    const currentTime = Math.floor(Date.now() / 1000);
    const duration = (finish - currentTime) / 60 / 60 / 24;
    console.log('duration', duration)
    const weekDurationRatio = 7 / duration;
    console.log('weekDurationRatio', weekDurationRatio)
    const rtBal = +utils.formatUnits(await Erc20Utils.balanceOf(MaticAddresses.QUICK_TOKEN, poolContract.address));
    let rtBalUsd = rtBal * +utils.formatUnits(quickPrice);

    if (duration <= 0) {
      rtBalUsd = 0;
    }

    const tvl = await poolContract.totalSupply();
    const underlyingPrice = await oracle.getPrice(lp);
    const tvlUsd = +utils.formatUnits(tvl) * +utils.formatUnits(underlyingPrice);

    const apr = ((rtBalUsd / tvlUsd) / duration) * 365 * 100

    const data = i + ',' +
        'QUICK_' + token0Name + '_' + token1Name + ',' +
        lp + ',' +
        token0 + ',' +
        token0Name + ',' +
        token1 + ',' +
        token1Name + ',' +
        info[0] + ',' +
        rtBal.toFixed(2) + ',' +
        duration.toFixed(2) + ',' +
        (rtBalUsd * weekDurationRatio).toFixed(2) + ',' +
        tvlUsd.toFixed(2) + ',' +
        apr.toFixed(2)
    ;
    console.log(data);
    infos += data + '\n';
  }

  await writeFileSync('./tmp/quick_pools.csv', infos, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
