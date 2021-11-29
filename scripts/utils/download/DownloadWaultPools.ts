import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {
  ERC20,
  IWaultSwapPair,
  IWexPolyMaster,
  PriceCalculator,
  SmartVault
} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {VaultUtils} from "../../../test/VaultUtils";


async function downloadWault() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const chef = await DeployerUtils.connectInterface(signer, 'IWexPolyMaster', MaticAddresses.WAULT_POLYMASTER) as IWexPolyMaster;

  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '4') {
      continue;
    }
    underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    if (vInfo.active) {
      console.log(vInfo.addr);
      const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
      const rewards = await VaultUtils.vaultRewardsAmount(vctr, core.psVault);
      console.log('rewards', rewards);
      currentRewards.set(vInfo.underlying.toLowerCase(), rewards);
    }
  }

  const poolLength = (await chef.poolLength()).toNumber();
  console.log('length', poolLength);

  const wexPerBlock = await chef.wexPerBlock();
  const totalAllocPoint = await chef.totalAllocPoint();
  const wexPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.WEXpoly_TOKEN);
  console.log('wex price', utils.formatUnits(wexPrice));

  let infos: string = 'idx, lp_name, lp_address, token0, token0_name, token1, token1_name, alloc, weekRewardUsd, tvlUsd, apr, currentRewards, vault \n';
  for (let i = 0; i < poolLength; i++) {
    const poolInfo = await chef.poolInfo(i);
    const lp = poolInfo[0];
    const status = underlyingStatuses.get(lp.toLowerCase());
    if (!status) {
      continue;
    }
    const lpContract = await DeployerUtils.connectInterface(signer, 'IWaultSwapPair', lp) as IWaultSwapPair

    const waultAllocPoint = poolInfo[1];
    const currentBlock = await web3.eth.getBlockNumber();
    const duration = currentBlock - poolInfo[2].toNumber();
    console.log('duration', duration, currentBlock, poolInfo[2].toNumber());
    const weekRewardUsd = computeWeekReward(duration, wexPerBlock, waultAllocPoint, totalAllocPoint, wexPrice);
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
      const _lpContract = await DeployerUtils.connectInterface(signer, 'IWaultSwapPair', lp) as IWaultSwapPair;
      token0 = await _lpContract.token0();
      token1 = await _lpContract.token1();
      token0Name = await TokenUtils.tokenSymbol(token0);
      token1Name = await TokenUtils.tokenSymbol(token1);
    } catch (e) {
    }

    if (token0 === '') {
      const token = await DeployerUtils.connectInterface(signer, 'ERC20', lp) as ERC20;
      token0Name = await token.symbol();
    }

    const data = i + ',' +
        'WAULT_' + token0Name + (token1Name ? '_' + token1Name : '') + ',' +
        lp + ',' +
        token0 + ',' +
        token0Name + ',' +
        token1 + ',' +
        token1Name + ',' +
        poolInfo[1] + ',' +
        weekRewardUsd.toFixed() + ',' +
        (+tvlUsd).toFixed() + ',' +
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
  writeFileSync('./tmp/download/wault_pools.csv', infos, 'utf8');
  console.log('done');
}

downloadWault()
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
    averageBlockTime = 2.25
): number {
  const reward = BigNumber.from(block).mul(tokenPerBlock).mul(allocPoint).div(totalAllocPoint);
  const timeWeekRate = (60 * 60 * 24 * 7) / (block * averageBlockTime);
  const rewardForWeek = +utils.formatUnits(reward) * timeWeekRate;
  return +utils.formatUnits(tokenPrice) * rewardForWeek;
}
