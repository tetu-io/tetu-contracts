import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {
  Announcer,
  AutoRewarder,
  Bookkeeper,
  Controller,
  PriceCalculator,
  RewardCalculator,
  SmartVault
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MintHelperUtils} from "../MintHelperUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ethers} from "hardhat";

const {expect} = chai;
chai.use(chaiAsPromised);

const vaultsSet = new Set<string>([
  '0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7',
  '0x57205cC741f8787a5195B2126607ac505E11B650',
  '0x5de724eD41317fD0212133ef4A1530005bb5837f'
]);

describe("auto rewarder tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let priceCalculator: PriceCalculator;
  let rewardCalculator: RewardCalculator;
  let rewarder: AutoRewarder;
  let bookkeeper: Bookkeeper;
  let controller: Controller;
  let announcer: Announcer;
  let core: CoreContractsWrapper;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();

    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));

    core = await DeployerUtils.getCoreAddressesWrapper(signer);
    const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

    bookkeeper = core.bookkeeper
    controller = core.controller
    announcer = core.announcer

    priceCalculator = tools.calculator
    rewardCalculator = (await DeployerUtils.deployRewardCalculator(signer, controller.address, priceCalculator.address))[0] as RewardCalculator;
    rewarder = (await DeployerUtils.deployAutoRewarder(
      signer,
      controller.address,
      rewardCalculator.address,
      utils.parseUnits('0.231').toString(),
      utils.parseUnits('1000').toString()
    ))[0];

    console.log('gov', await controller.governance())
    // await rewardCalculator.set
    await controller.setRewardDistribution([rewarder.address], true);
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });

  it.skip("distribute to all", async () => {
    const rewardsPerDay = await rewarder.rewardsPerDay();
    console.log('rewards per day', utils.formatUnits(rewardsPerDay));

    await MintHelperUtils.mint(controller, announcer,'0', rewarder.address, true);

    const bal = await TokenUtils.balanceOf(core.rewardToken.address, rewarder.address);
    console.log('minted', utils.formatUnits(bal));

    const vaults = await bookkeeper.vaults();
    console.log('vaults', vaults.length)

    const step = 2;

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('collect', i, i + step);
      console.log('vaults.slice(i, i + step)', vaults.slice(i, i + step))
      try {
        await rewarder.collectAndStoreInfo(vaults.slice(i, i + step));
      } catch (e) {
        console.log('error collect', e);
      }

    }

    console.log('totalStrategyRewards', utils.formatUnits(await rewarder.totalStrategyRewards()));

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('distribute', i, i + step);
      await distribute(rewarder, step, core.psVault.address);
    }

    const distributed = await rewarder.distributed();
    expect(distributed).is.eq(0);
  });

  it("distribute to vaults set", async () => {
    const net = await ethers.provider.getNetwork();
    // todo creat on fantom
    if (net.chainId !== 137) {
      return;
    }
    const rewardsPerDay = await rewarder.rewardsPerDay();
    console.log('rewards per day', utils.formatUnits(rewardsPerDay));

    await TokenUtils.getToken(core.rewardToken.address, rewarder.address, utils.parseUnits('100000'));

    const bal = await TokenUtils.balanceOf(core.rewardToken.address, rewarder.address);
    console.log('minted', utils.formatUnits(bal));

    const vaults = Array.from(vaultsSet.keys());
    console.log('vaults', vaults.length)

    const step = 2;

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('collect', i, i + step);
      console.log('vaults.slice(i, i + step)', vaults.slice(i, i + step))
      try {
        await rewarder.collectAndStoreInfo(vaults.slice(i, i + step));
      } catch (e) {
        console.log('error collect', e);
      }
    }
    expect(await rewarder.totalStrategyRewards()).is.not.eq(0);

    console.log('totalStrategyRewards', utils.formatUnits(await rewarder.totalStrategyRewards()));

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('distribute', i, i + step);
      await distribute(rewarder, step, core.psVault.address);
    }

    let distributedSum = BigNumber.from(0)
    let strategyRewardsSum = BigNumber.from(0)
    for (const vault of vaults) {
      const distributed = await rewarder.lastDistributedAmount(vault)
      const info = await rewarder.lastInfo(vault)
      strategyRewardsSum = strategyRewardsSum.add(info.strategyRewardsUsd);
      distributedSum = distributedSum.add(distributed)
      console.log('distributed', utils.formatUnits(distributed));
      console.log('info.strategyRewardsUsd', utils.formatUnits(info.strategyRewardsUsd));
    }

    console.log('distributed sum', utils.formatUnits(distributedSum));
    console.log('strategyRewardsSum', utils.formatUnits(strategyRewardsSum));

    for (const vault of vaults) {
      const info = await rewarder.lastInfo(vault)
      const distributed = +utils.formatUnits(await rewarder.lastDistributedAmount(vault))
      const toDistribute = +utils.formatUnits(rewardsPerDay) * (
        +utils.formatUnits(info.strategyRewardsUsd) / +utils.formatUnits(strategyRewardsSum)
      )
      console.log('toDistribute', toDistribute)
      console.log('distributed', distributed)
      expect(distributed).approximately(toDistribute, toDistribute * 0.0001);
    }
    expect(+utils.formatUnits(distributedSum)).is.approximately(+utils.formatUnits(await rewarder.rewardsPerDay()), 0.00001);

    expect(await rewarder.distributed()).is.eq(0);

    await expect(rewarder.distribute(1)).rejectedWith('AR: Too early');

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    await expect(rewarder.distribute(1)).rejectedWith('AR: Info too old');

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('collect2', i, i + step);
      console.log('vaults.slice(i, i + step)2', vaults.slice(i, i + step))
      for (const v of vaults) {
        await controller.doHardWork(v);
      }
      try {
        await rewarder.collectAndStoreInfo(vaults.slice(i, i + step));
      } catch (e) {
        console.log('error collect2', e);
      }

    }
    expect(await rewarder.totalStrategyRewards()).is.not.eq(0);

    for (let i = 0; i < vaults.length; i = i + step) {
      console.log('distribute2', i, i + step);
      await distribute(rewarder, step, core.psVault.address);
    }

    expect(await rewarder.distributed()).is.eq(0);

    distributedSum = BigNumber.from(0)
    for (const vault of vaults) {
      const distributed = await rewarder.lastDistributedAmount(vault)
      distributedSum = distributedSum.add(distributed)
      console.log('distributed', utils.formatUnits(distributed));
    }

    console.log('distributed sum', utils.formatUnits(distributedSum));
    expect(+utils.formatUnits(distributedSum)).is.approximately(+utils.formatUnits(await rewarder.rewardsPerDay()), 0.00001);
  });

});

async function distribute(rewarder: AutoRewarder, count: number, xTetu: string) {
  const xTetuVault = await DeployerUtils.connectInterface(rewarder.signer as SignerWithAddress, 'SmartVault', xTetu) as SmartVault
  const vaultsSize = (await rewarder.vaultsSize()).toNumber();
  // console.log('vaultsSize', vaultsSize);
  const currentId = (await rewarder.lastDistributedId()).toNumber();
  const to = Math.min(vaultsSize, currentId + count);
  // console.log('currentId', currentId, to);
  const data = [];
  for (let i = currentId; i < to; i++) {
    console.log('i', i)
    const vault = await rewarder.vaults(i);
    // console.log('vault', i, vault);
    data.push({
      vault,
      bal: await xTetuVault.underlyingBalanceWithInvestmentForHolder(vault)
    });
  }
  console.log('DISTRIBUTE', count, (await rewarder.lastDistributedId()).toString());
  await rewarder.distribute(count);

  for (const d of data) {
    const vault = d.vault;
    // console.log('vault', vault);
    const distributed = await rewarder.lastDistributedAmount(vault);
    console.log('distributed', utils.formatUnits(distributed))
    const curBal = await xTetuVault.underlyingBalanceWithInvestmentForHolder(vault);
    expect(+utils.formatUnits(curBal.sub(d.bal))).is.approximately(+utils.formatUnits(distributed), 0.00001);
  }
}
