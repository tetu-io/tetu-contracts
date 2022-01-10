import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IDragonLair,
  IStakingDualRewards,
  IStakingRewardsFactoryV2,
  IUniswapV2Pair,
  PriceCalculator,
  SmartVault
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {utils} from "ethers";
import {VaultUtils} from "../../../test/VaultUtils";
import {TokenUtils} from "../../../test/TokenUtils";

const exclude = new Set<string>([]);


async function downloadQuick() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const factory = await DeployerUtils.connectInterface(signer, 'IStakingRewardsFactoryV2', MaticAddresses.QUICK_STAKING_FACTORY_V3) as IStakingRewardsFactoryV2;

  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '2') {
      continue;
    }
    underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    if (vInfo.active) {
      const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
      currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.psVault));
    }
  }
  console.log('loaded vaults', underlyingStatuses.size);
  const poolLength = 10000;
  const quickPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.QUICK_TOKEN);
  const maticPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.WMATIC_TOKEN);

  const dQuickCtr = await DeployerUtils.connectInterface(signer, 'IDragonLair', MaticAddresses.dQUICK_TOKEN) as IDragonLair;
  const dQuickRatio = await dQuickCtr.dQUICKForQUICK(utils.parseUnits('1'));
  const dQuickPrice = quickPrice.mul(dQuickRatio).div(utils.parseUnits('1'));
  console.log('dQuickPrice', utils.formatUnits(dQuickPrice));
  console.log('quickPrice', utils.formatUnits(quickPrice));
  console.log('maticPrice', utils.formatUnits(maticPrice));

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, pool, rewardAmount, vault, weekRewardUsd, tvlUsd, apr, currentRewards, r0, r1 \n';
  for (let i = 0; i < poolLength; i++) {
    console.log('id', i);
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

    console.log('lp', lp);

    const status = underlyingStatuses.get(lp.toLowerCase());
    if (!status) {
      console.log('not active', i);
      // continue;
    }

    try {
      const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      token0 = await lpContract.token0();
      token1 = await lpContract.token1();
      token0Name = await TokenUtils.tokenSymbol(token0);
      token1Name = await TokenUtils.tokenSymbol(token1);
    } catch (e) {
      console.error('cant fetch token names for ', lp);
      continue;
    }

    const info = await factory.stakingRewardsInfoByStakingToken(lp);
    console.log('info', info)
    // factory doesn't hold duration, suppose that it is a week
    const durationSec = 60 * 60 * 24 * 7;

    const poolContract = await DeployerUtils.connectInterface(signer, 'IStakingDualRewards', info[0]) as IStakingDualRewards;

    const rewardRateA = await poolContract.rewardRateA();
    const rewardRateB = await poolContract.rewardRateB();
    const notifiedAmountA = rewardRateA.mul(durationSec);
    const notifiedAmountB = rewardRateB.mul(durationSec);
    const notifiedAmountNA = +utils.formatUnits(notifiedAmountA);
    const notifiedAmountNB = +utils.formatUnits(notifiedAmountB);

    let durationDays = (durationSec) / 60 / 60 / 24;
    const weekDurationRatio = 7 / durationDays;
    let notifiedAmountUsdA = notifiedAmountNA * +utils.formatUnits(dQuickPrice);
    let notifiedAmountUsdB = notifiedAmountNB * +utils.formatUnits(maticPrice);

    const finish = (await poolContract.periodFinish()).toNumber();
    const currentTime = Math.floor(Date.now() / 1000);

    if (finish < currentTime) {
      console.log('reward finished', token0Name, token1Name);
      durationDays = 0
      notifiedAmountUsdA = 0;
      notifiedAmountUsdB = 0;
    }

    console.log('duration', durationDays);
    console.log('weekDurationRatio', weekDurationRatio);
    console.log('notifiedAmountA', notifiedAmountNA);
    console.log('notifiedAmountB', notifiedAmountNB);
    const notifiedAmountUsd = notifiedAmountNA + notifiedAmountNB;
    let tvlUsd = 0;
    try {
      const tvl = await poolContract.totalSupply();
      const underlyingPrice = await priceCalculator.getPriceWithDefaultOutput(lp);
      tvlUsd = +utils.formatUnits(tvl) * +utils.formatUnits(underlyingPrice);
    } catch (e) {
      console.log('error fetch tvl', lp);
    }
    const apr = ((notifiedAmountUsd / tvlUsd) / durationDays) * 365 * 100;

    const reward0 = await poolContract.rewardsTokenA();
    const reward1 = await poolContract.rewardsTokenB();

    const data = i + ',' +
      'QUICK_' + token0Name + '_' + token1Name + ',' +
      lp + ',' +
      token0 + ',' +
      token0Name + ',' +
      token1 + ',' +
      token1Name + ',' +
      info[0] + ',' +
      notifiedAmountUsd.toFixed(2) + ',' +
      underlyingToVault.get(lp.toLowerCase()) + ',' +
      (notifiedAmountUsd * weekDurationRatio).toFixed(2) + ',' +
      tvlUsd.toFixed(2) + ',' +
      apr.toFixed(2) + ',' +
      currentRewards.get(lp.toLowerCase()) + ',' +
      reward0 + ',' +
      reward1
    ;
    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  writeFileSync('./tmp/download/quick_pools_dual.csv', infos, 'utf8');
  console.log('done');
}

downloadQuick()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
