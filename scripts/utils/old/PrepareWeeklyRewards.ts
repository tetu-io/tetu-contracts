import {ethers} from "hardhat";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {
  Bookkeeper,
  ContractReader,
  IMiniChefV2,
  IRewarder,
  IStakingRewardsFactory,
  IStrategy,
  PriceCalculator,
  SNXRewardInterface
} from "../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {MaticAddresses} from "../../../test/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const tetuLp = (await DeployerUtils.getTokenAddresses()).get('sushi_lp_token_usdc') as string;

  const bookkeeper = await DeployerUtils.connectContract(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;
  const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;
  const quickStakingFactory = await DeployerUtils.connectInterface(signer, 'IStakingRewardsFactory', MaticAddresses.QUICK_STAKING_FACTORY) as IStakingRewardsFactory;

  const batch = 1000;
  const tetuLpAmount = 4_000_000;
  const rewardTokenAmount = 29_971_355 - tetuLpAmount;
  const vaults = await bookkeeper.vaults({gasLimit: 100_000_000});
  const prices = new Map<string, number>();

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });


  // **************** COLLECT INFO ********************

  const poolRewardsUsdc = new Map<string, any[]>();
  let poolRewardsUsdcTotal = 0;
  let humanDataResults = '';

  for (let vault of vaults) {
    let vInfo;
    try {
      vInfo = await cReader.vaultInfo(vault);
    } catch (e) {
      console.error('error fetch vInfo', vault);
      return;
    }
    if (!vInfo.active || vault === core.psVault || vInfo.underlying.toLowerCase() === tetuLp.toLowerCase()) {
      console.log('skip', vInfo.name);
      continue;
    }

    console.log('vault', vInfo.name);

    let poolWeeklyRewardsAmountUsdc: number = 0;

    try {
      // todo fix calculation in the contract
      if (vInfo.platform === 2) {
        poolWeeklyRewardsAmountUsdc = await quickPoolWeeklyRewardsAmountUsdc(vInfo.underlying, calculator, prices, quickStakingFactory, signer);
      } else {
        poolWeeklyRewardsAmountUsdc = await defaultPoolWeeklyRewardsAmountUsdc(vInfo, signer, prices, calculator);
      }
    } catch (e) {
      console.error('Error calc pool rewards amount', vInfo.name, e);
      throw Error('Error calc pool rewards amount');
    }

    if (poolWeeklyRewardsAmountUsdc === 0) {
      throw Error('zero rewards for ' + vault);
    }

    poolRewardsUsdc.set(vault, [
      poolWeeklyRewardsAmountUsdc,
      vInfo.name,
      poolWeeklyRewardsAmountUsdc
    ]);
    poolRewardsUsdcTotal += poolWeeklyRewardsAmountUsdc;

  }

  // *************** BUILD DATA **********************


  let vaultsToDistribute = '';
  let amountsToDistribute = '';
  let sum = BigNumber.from(0);
  let i = 0;

  let poolRatioTotal = 0;
  for (let vAdr of Array.from(poolRewardsUsdc.keys())) {

    const data = poolRewardsUsdc.get(vAdr) as any[];
    const rewUsdc = data[0]
    const vName = data[1];
    const poolWeeklyRewardsAmountUsdc = data[2];

    const poolRatio = rewUsdc / poolRewardsUsdcTotal;
    poolRatioTotal += poolRatio;
    const tetuAmount = rewardTokenAmount * poolRatio;
    console.log('ratio', poolRatio.toFixed(4), rewUsdc.toFixed(), poolRewardsUsdcTotal.toFixed(), tetuAmount.toFixed());


    vaultsToDistribute += vAdr + ',';
    amountsToDistribute += utils.parseUnits(tetuAmount.toString()).toString() + ',';
    sum = sum.add(utils.parseUnits(tetuAmount.toString()));

    humanDataResults +=
        vName + ','
        + vAdr + ','
        + tetuAmount.toString() + ','
        + poolWeeklyRewardsAmountUsdc.toString()
        + '\n'

    i++;
    if (i % batch === 0 || i === Array.from(poolRewardsUsdc.keys()).length) {
      vaultsToDistribute = vaultsToDistribute.substr(0, vaultsToDistribute.length - 1);
      amountsToDistribute = amountsToDistribute.substr(0, amountsToDistribute.length - 1);

      console.log('sum', utils.formatUnits(sum), `./tmp/to_distribute_${i}.txt`, poolRatioTotal);
      await writeFileSync(`./tmp/to_distribute_${i}.txt`,
          vaultsToDistribute
          + '\n'
          + amountsToDistribute + '\n'
          + sum
          , 'utf8');
      vaultsToDistribute = '';
      amountsToDistribute = '';
      sum = BigNumber.from(0);
    }

  }

  await writeFileSync(`./tmp/to_distribute_human.txt`,
      humanDataResults
      , 'utf8');

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

async function defaultPoolWeeklyRewardsAmountUsdc(
    vInfo: any,
    signer: SignerWithAddress,
    prices: Map<string, number>,
    calculator: PriceCalculator
): Promise<number> {
  let poolWeeklyRewardsAmountUsdc: number = 0;
  const strat = vInfo.strategy;
  const stratContract = await DeployerUtils.connectInterface(signer, 'IStrategy', strat) as IStrategy;
  const rts = vInfo.strategyRewards;

  for (let i = 0; i < rts.length; i++) {
    const rt = rts[i];
    let rewardsData: BigNumber[];
    try {
      rewardsData = await stratContract.poolWeeklyRewardsAmount({gasLimit: 100_000_000});
    } catch (e) {
      console.error('error fetch stratContract.poolWeeklyRewardsAmount()', e);
      throw Error('error fetch stratContract.poolWeeklyRewardsAmount()');
    }

    const rtDec = await Erc20Utils.decimals(rt);

    if (!prices.has(rt)) {
      try {
        const rtPrice = await calculator.getPriceWithDefaultOutput(rt);
        prices.set(rt, +utils.formatUnits(rtPrice));
        console.log('rt price', rt, prices.get(rt));
      } catch (e) {
        throw Error('error fetch price for ' + rt);
      }
    }

    poolWeeklyRewardsAmountUsdc += +utils.formatUnits(rewardsData[i], rtDec) * (prices.get(rt) as number);
  }
  return poolWeeklyRewardsAmountUsdc;
}

async function quickPoolWeeklyRewardsAmountUsdc(
    lp: string,
    calculator: PriceCalculator,
    prices: Map<string, number>,
    quickStakingFactory: IStakingRewardsFactory,
    signer: SignerWithAddress,
): Promise<number> {

  let quickPriceN: number;
  if (!prices.has(MaticAddresses.QUICK_TOKEN)) {
    quickPriceN = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(MaticAddresses.QUICK_TOKEN));
    prices.set(MaticAddresses.QUICK_TOKEN, quickPriceN);
  } else {
    quickPriceN = prices.get(MaticAddresses.QUICK_TOKEN) as number;
  }


  const info = await quickStakingFactory.stakingRewardsInfoByStakingToken(lp);
  // factory doesn't hold duration, suppose that it is a week
  const durationSec = 60 * 60 * 24 * 7;

  const poolContract = await DeployerUtils.connectInterface(signer, 'SNXRewardInterface', info[0]) as SNXRewardInterface;

  const rewardRate = await poolContract.rewardRate();
  const notifiedAmount = rewardRate.mul(durationSec);
  const notifiedAmountN = +utils.formatUnits(notifiedAmount);
  console.log('notifiedAmount', notifiedAmountN);


  let durationDays = (durationSec) / 60 / 60 / 24;
  const weekDurationRatio = 7 / durationDays;
  let notifiedAmountUsd = notifiedAmountN * quickPriceN;

  const finish = (await poolContract.periodFinish()).toNumber();
  const currentTime = Math.floor(Date.now() / 1000);

  if (finish < currentTime) {
    durationDays = 0
    notifiedAmountUsd = 0;
  }

  console.log('duration', durationDays)
  console.log('weekDurationRatio', weekDurationRatio)

  return notifiedAmountUsd;
}

async function sushiData(
    poolId: number,
    signer: SignerWithAddress,
    chef: IMiniChefV2,
    sushiPerSecond: BigNumber,
    totalAllocPoint: BigNumber,
    sushiPrice: BigNumber,
    maticPrice: BigNumber,
): Promise<number> {
  const lp = await chef.lpToken(poolId);
  const poolInfo = await chef.poolInfo(poolId);

  const sushiAllocPoint = poolInfo[2];
  const sushiDuration = +(((Date.now() / 1000) - poolInfo[1].toNumber()).toFixed(0));

  const sushiWeekRewardUsd = computeMCWeekReward(sushiDuration, sushiPerSecond, sushiAllocPoint, totalAllocPoint, sushiPrice);
  console.log('sushiWeekRewardUsd', sushiWeekRewardUsd);

  const rewarder = await chef.rewarder(poolId);
  const rewarderContract = await DeployerUtils.connectInterface(signer, 'IRewarder', rewarder) as IRewarder;

  const rewarderPoolInfo = await rewarderContract.poolInfo(poolId);
  // can be block rewarder
  const maticPerSec = await rewarderContract.rewardPerSecond();
  // just hope that the same as chef
  // otherwise need to parse all events
  const maticTotalAllocPoint = totalAllocPoint;
  const maticDuration = +(((Date.now() / 1000) - rewarderPoolInfo[1].toNumber()).toFixed(0));
  const maticWeekRewardUsd = computeMCWeekReward(maticDuration, maticPerSec, rewarderPoolInfo[2], maticTotalAllocPoint, maticPrice);
  console.log('maticWeekRewardUsd', maticWeekRewardUsd);

  return maticWeekRewardUsd + sushiWeekRewardUsd;
}

function computeMCWeekReward(
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
