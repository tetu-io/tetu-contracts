import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IDragonLair,
  IStakingRewards,
  IStakingRewardsFactorySyrups,
  PriceCalculator
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {utils} from "ethers";

const exclude = new Set<string>([]);


async function start() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const factory = await DeployerUtils.connectInterface(signer, 'IStakingRewardsFactorySyrups', MaticAddresses.QUICK_STAKING_FACTORY_SYRUP) as IStakingRewardsFactorySyrups;

  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;


  // no info in contract
  const rewardTokensLength = 10000;
  const quickPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.QUICK_TOKEN);

  const dQuickCtr = await DeployerUtils.connectInterface(signer, 'IDragonLair', MaticAddresses.dQUICK_TOKEN) as IDragonLair;
  const dQuickRatio = await dQuickCtr.dQUICKForQUICK(utils.parseUnits('1'));
  const dQuickPrice = quickPrice.mul(dQuickRatio).div(utils.parseUnits('1'));
  console.log('dQuickPrice', utils.formatUnits(dQuickPrice));
  console.log('quickPrice', utils.formatUnits(quickPrice));

  // tslint:disable-next-line
  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, pool, rewardAmount, vault, weekRewardUsd, tvlUsd, apr, currentRewards \n';
  for (let i = 0; i < rewardTokensLength; i++) {
    console.log('id', i);
    let rewardToken;

    try {
      rewardToken = await factory.rewardTokens(i);
    } catch (e) {
      console.log('looks like we dont have more rewards', i);
      break;
    }

    console.log('rewardToken', rewardToken);


    const info = await factory.stakingRewardsInfoByRewardToken(rewardToken);
    console.log('info', info);

    // // factory doesn't hold duration, suppose that it is a week
    // const durationSec = 60 * 60 * 24 * 7;
    //
    // const poolContract = await DeployerUtils.connectInterface(signer, 'IStakingRewards', info[0]) as IStakingRewards;
    //
    // const rewardRate = await poolContract.rewardRate();
    // const notifiedAmount = rewardRate.mul(durationSec);
    // const notifiedAmountN = +utils.formatUnits(notifiedAmount);
    //
    // let durationDays = (durationSec) / 60 / 60 / 24;
    // const weekDurationRatio = 7 / durationDays;
    // let notifiedAmountUsd = notifiedAmountN * +utils.formatUnits(dQuickPrice);
    //
    // const finish = (await poolContract.periodFinish()).toNumber();
    // const currentTime = Math.floor(Date.now() / 1000);
    //
    // if (finish < currentTime) {
    //   console.log('reward finished', token0Name, token1Name);
    //   durationDays = 0
    //   notifiedAmountUsd = 0;
    // }
    //
    // console.log('duration', durationDays);
    // console.log('weekDurationRatio', weekDurationRatio);
    // console.log('notifiedAmount', notifiedAmountN);
    // let tvlUsd = 0;
    // try {
    //   const tvl = await poolContract.totalSupply();
    //   const underlyingPrice = await priceCalculator.getPriceWithDefaultOutput(rewardToken);
    //   tvlUsd = +utils.formatUnits(tvl) * +utils.formatUnits(underlyingPrice);
    // } catch (e) {
    //   console.log('error fetch tvl', rewardToken);
    // }
    // const apr = ((notifiedAmountUsd / tvlUsd) / durationDays) * 365 * 100
    //
    // const data = i + ',' +
    //   'QUICK_' + token0Name + '_' + token1Name + ',' +
    //   rewardToken + ',' +
    //   token0 + ',' +
    //   token0Name + ',' +
    //   token1 + ',' +
    //   token1Name + ',' +
    //   info[0] + ',' +
    //   notifiedAmountUsd.toFixed(2) + ',' +
    //   underlyingToVault.get(rewardToken.toLowerCase()) + ',' +
    //   (notifiedAmountUsd * weekDurationRatio).toFixed(2) + ',' +
    //   tvlUsd.toFixed(2) + ',' +
    //   apr.toFixed(2) + ',' +
    //   currentRewards.get(rewardToken.toLowerCase())
    // ;
    // console.log(data);
    // infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  writeFileSync('./tmp/download/quick_syrups.csv', infos, 'utf8');
  console.log('done');
}

start()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
