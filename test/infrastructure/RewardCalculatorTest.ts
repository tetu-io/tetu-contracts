import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {Bookkeeper, IStrategy, PriceCalculator, RewardCalculator} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {utils} from "ethers";
import {Addresses} from "../../addresses";

const {expect} = chai;
chai.use(chaiAsPromised);

const exclude = new Set<string>([
  'NoopStrategy'
]);

describe("Reward calculator tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let priceCalculator: PriceCalculator;
  let rewardCalculator: RewardCalculator;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);

    priceCalculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0] as PriceCalculator;
    rewardCalculator = (await DeployerUtils.deployRewardCalculator(signer, core.controller.address, priceCalculator.address))[0] as RewardCalculator;
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

  it("strategy reward usd SUSHI_WMATIC_WETH", async () => {
    const strategy = '0x3bDbd2Ed1A214Ca4ba4421ddD7236ccA3EF088b6';
    const rewardUsd = +utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24 * 7));
    console.log('rewardUsd', rewardUsd)
    expect(rewardUsd).is.approximately(200000, 100000);
  });

  it("strategy reward usd QUICK_WMATIC_WETH", async () => {
    const strategy = '0x0a4Ed882FD66B2C4eEC49FB16C56C9fe2b97b9E7';
    const rewardUsd = +utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24 * 7));
    console.log('rewardUsd', rewardUsd)
    expect(rewardUsd).is.approximately(200000, 100000);
  });

  it("strategy reward usd cafe", async () => {
    const strategy = '0xD45347527c567244CfDca6c296D4F0940F747D98';
    const rewardUsd = +utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24 * 7));
    console.log('rewardUsd', rewardUsd)
    expect(rewardUsd).is.approximately(500000, 300000);
  });

  it.skip("strategy reward usd for all", async () => {
    // @ts-ignore
    const bkAdr = Addresses.CORE.get('matic').bookkeeper;
    const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', bkAdr) as Bookkeeper;
    const strats = await bookkeeper.strategies();
    for (let strategy of strats) {
      const strCtr = await DeployerUtils.connectInterface(signer, 'IStrategy', strategy) as IStrategy;
      const name = await strCtr.STRATEGY_NAME();
      if (exclude.has(name)) {
        continue;
      }
      console.log('strategy', strategy, name)
      const rewardUsd = +utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24 * 7));
      console.log('rewardUsd', rewardUsd);

      // expect(rewardUsd).is.not.eq(0);
    }
  });


});
