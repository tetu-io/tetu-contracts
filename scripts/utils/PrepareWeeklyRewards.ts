import {ethers} from "hardhat";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {
  Bookkeeper,
  ContractReader,
  IMiniChefV2,
  IRewarder,
  IStrategy,
  PriceCalculator
} from "../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Erc20Utils} from "../../test/Erc20Utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const bookkeeper = await DeployerUtils.connectContract(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;
  const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const tetuLpAmount = 4_000_000;
  const rewardTokenAmount = 29_971_355 - tetuLpAmount;
  const vaults = await bookkeeper.vaults({gasLimit: 100_000_000});
  const prices = new Map<string, number>();

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // *********** RESULT VARS ***********
  const poolRewardsUsdc = new Map<string, number>();
  let poolRewardsUsdcTotal = 0;
  for (let vault of vaults) {
    let vInfo;
    try {
      vInfo = await cReader.vaultInfo(vault);
    } catch (e) {
      console.error('error fetch vInfo', vault);
      return;
    }
    if (!vInfo.active || vault === core.psVault) {
      console.log('skip', vInfo.name);
      continue;
    }

    console.log('vault', vInfo.name);

    const strat = vInfo.strategy;
    const stratContract = await DeployerUtils.connectInterface(signer, 'IStrategy', strat) as IStrategy;

    const rts = vInfo.strategyRewards;

    let poolWeeklyRewardsAmountUsdc: number = 0;
    for (let i = 0; i < rts.length; i++) {
      const rt = rts[i];
      const rewardsData = await stratContract.poolWeeklyRewardsAmount();
      const rtDec = await Erc20Utils.decimals(rt);

      if (!prices.has(rt)) {
        try {
          const rtPrice = await calculator.getPriceWithDefaultOutput(rt);
          prices.set(rt, +utils.formatUnits(rtPrice));
          console.log('rt price', rt, rtPrice);
        } catch (e) {
          console.log('error fetch price for ', rt);
          return;
        }
      }

      poolWeeklyRewardsAmountUsdc += +utils.formatUnits(rewardsData[i], rtDec) * (prices.get(rt) as number);
    }

    if (poolWeeklyRewardsAmountUsdc === 0) {
      throw Error('zero rewards for ' + vault);
    }

    poolRewardsUsdc.set(vInfo.name + "|" + vault, poolWeeklyRewardsAmountUsdc);
    poolRewardsUsdcTotal += poolWeeklyRewardsAmountUsdc;
  }


  let vaultNames = '';
  let vaultsToDistribute = '';
  let amountsToDistribute = '';
  let sum = BigNumber.from(0);
  let i = 0;

  let poolRatioTotal = 0;
  for (let vKey of Array.from(poolRewardsUsdc.keys())) {

    const rewUsdc = poolRewardsUsdc.get(vKey) as number;

    const poolRatio = rewUsdc / poolRewardsUsdcTotal;
    poolRatioTotal += poolRatio;
    const tetuAmount = rewardTokenAmount * poolRatio;
    console.log('ratio', poolRatio.toFixed(4), rewUsdc.toFixed(), poolRewardsUsdcTotal.toFixed(), tetuAmount.toFixed());


    const vName = vKey.split('|')[0];
    const vAdr = vKey.split('|')[1];

    vaultNames += vName + ',';
    vaultsToDistribute += vAdr + ',';
    amountsToDistribute += utils.parseUnits(tetuAmount.toString()).toString() + ',';
    sum = sum.add(utils.parseUnits(tetuAmount.toString()));

    i++;
    if (i % 50 === 0 || i === vaults.length - 1) {
      vaultNames = vaultNames.substr(0, vaultNames.length - 1);
      vaultsToDistribute = vaultsToDistribute.substr(0, vaultsToDistribute.length - 1);
      amountsToDistribute = amountsToDistribute.substr(0, amountsToDistribute.length - 1);

      console.log('sum', utils.formatUnits(sum), `./tmp/to_distribute_${i}.txt`, poolRatioTotal);
      await writeFileSync(`./tmp/to_distribute_${i}.txt`,
          vaultNames + '\n' + vaultsToDistribute + '\n' + amountsToDistribute + '\n' + sum
          , 'utf8');

    }

  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

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
