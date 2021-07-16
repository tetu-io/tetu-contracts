import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {Bookkeeper, IMiniChefV2, IOracleMatic, IRewarder, IStrategy} from "../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {MaticAddresses} from "../../test/MaticAddresses";
import {Erc20Utils} from "../../test/Erc20Utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const chef = await DeployerUtils.connectInterface(signer, 'IMiniChefV2', MaticAddresses.SUSHI_MINISHEFV2) as IMiniChefV2;
  const bookkeeper = await DeployerUtils.connectContract(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const oracle = await DeployerUtils.connectInterface(signer, 'IOracleMatic', '0xb8c898e946a1e82f244c7fcaa1f6bd4de028d559') as IOracleMatic;
  // TODO price from oracle
  const rewardTokenPrice = 0.1;
  const vaults = await bookkeeper.vaults();


  // ************** SUSHI STATS ****************
  const sushiPerSecond = await chef.sushiPerSecond();
  const sushiTotalAllocPoint = await chef.totalAllocPoint();
  const sushiPrice = await oracle.getPrice(MaticAddresses.SUSHI_TOKEN);
  console.log('sushi price', utils.formatUnits(sushiPrice));
  const maticPrice = await oracle.getPrice(MaticAddresses.WMATIC_TOKEN);
  console.log('maticPrice', utils.formatUnits(maticPrice));


  // *********** RESULT VARS ***********
  let vaultsToDistribute = '';
  let amountsToDistribute = '';
  let sum = BigNumber.from(0);

  for (let vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);

    if (!(await vaultContract.active()) || vault === core.psVault) {
      continue;
    }

    const strat = await vaultContract.strategy();
    const stratContract = await DeployerUtils.connectInterface(signer, 'IStrategy', strat) as IStrategy;

    const rts = await stratContract.rewardTokens();

    let poolWeeklyRewardsAmount: number = 0;
    for (let i = 0; i < rts.length; i++) {
      const rewardsData = await stratContract.poolWeeklyRewardsAmount();
      const rtDec = await Erc20Utils.decimals(rts[i]);
      poolWeeklyRewardsAmount += +utils.formatUnits(rewardsData[i], rtDec);
    }


    // const platform = await stratContract.platform();
    // if (platform === 'SUSHI') {
    //   const mcStrat = await DeployerUtils.connectInterface(signer, 'MCv2StrategyFullBuyback', strat) as MCv2StrategyFullBuyback;
    //   const poolId = await mcStrat.poolID();
    //   poolWeeklyRewardsAmount = await sushiData(
    //       poolId.toNumber(),
    //       signer,
    //       chef,
    //       sushiPerSecond,
    //       sushiTotalAllocPoint,
    //       sushiPrice,
    //       maticPrice
    //   );
    // } else {
    //   throw Error('Unknown platform ' + platform);
    // }

    if (poolWeeklyRewardsAmount === 0) {
      throw Error('zero rewards for ' + vault);
    }

    const rewardTokenAmount = poolWeeklyRewardsAmount / rewardTokenPrice

    vaultsToDistribute += vault + ',';
    amountsToDistribute += utils.parseUnits(rewardTokenAmount.toString()).toString() + ',';
    sum = sum.add(utils.parseUnits(rewardTokenAmount.toString()));


  }
  console.log('vaults', vaultsToDistribute);
  console.log('amounts', amountsToDistribute);
  console.log('sum', sum);
  await writeFileSync('./tmp/to_distribute.txt',
      vaultsToDistribute + '\n' + amountsToDistribute + '\n' + sum
      , 'utf8');
  console.log('done');
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
