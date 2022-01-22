import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TimeUtils } from '../TimeUtils';
import {
  Bookkeeper,
  IStrategy,
  PriceCalculator,
  RewardCalculator,
  SmartVault,
} from '../../typechain';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import { CoreContractsWrapper } from '../CoreContractsWrapper';
import { utils } from 'ethers';

const { expect } = chai;
chai.use(chaiAsPromised);

const exclude = new Set<string>(['NoopStrategy']);

describe('Reward calculator tests', function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let priceCalculator: PriceCalculator;
  let rewardCalculator: RewardCalculator;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    core = await DeployerUtils.getCoreAddressesWrapper(signer);
    // core = await DeployerUtils.deployAllCoreContracts(signer);

    priceCalculator = (
      await DeployerUtils.deployPriceCalculator(signer, core.controller.address)
    )[0] as PriceCalculator;
    rewardCalculator = (
      await DeployerUtils.deployRewardCalculator(
        signer,
        core.controller.address,
        priceCalculator.address,
      )
    )[0] as RewardCalculator;
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

  it('strategy reward', async () => {
    const vault = await core.bookkeeper._vaults(1);
    const vCtr = (await DeployerUtils.connectInterface(
      signer,
      'SmartVault',
      vault,
    )) as SmartVault;
    const strategy = await vCtr.strategy();
    const rewardUsd = +utils.formatUnits(
      await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24),
    );
    console.log('rewardUsd', rewardUsd);
    // todo activate after launch
    // expect(rewardUsd).is.not.eq(0);
  });

  // it("strategy reward sushi-matic-eth", async () => {
  //   const vault = '0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7';
  //   const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
  //   const strategy = await vCtr.strategy();
  //   const rewardUsd = +utils.formatUnits(await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24));
  //   console.log('rewardUsd', rewardUsd)
  //   expect(rewardUsd).is.not.eq(0);
  // });
  //
  // it("sushi-matic-eth vault kpi", async () => {
  //   const vault = '0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7';
  //   const kpi = +utils.formatUnits(await rewardCalculator.kpi(vault));
  //   console.log('kpi', kpi)
  //   expect(kpi).is.not.eq(0);
  // });

  it.skip('strategy reward usd for all', async () => {
    const bkAdr = (await DeployerUtils.getCoreAddresses()).bookkeeper;
    const bookkeeper = (await DeployerUtils.connectInterface(
      signer,
      'Bookkeeper',
      bkAdr,
    )) as Bookkeeper;
    const vaults = await bookkeeper.vaults();
    let sum = 0;
    for (const vault of vaults) {
      const vaultCtr = (await DeployerUtils.connectInterface(
        signer,
        'SmartVault',
        vault,
      )) as SmartVault;
      if (!(await vaultCtr.active())) {
        continue;
      }
      const strategy = await vaultCtr.strategy();
      const strCtr = (await DeployerUtils.connectInterface(
        signer,
        'IStrategy',
        strategy,
      )) as IStrategy;
      const name = await strCtr.STRATEGY_NAME();
      if (exclude.has(name)) {
        continue;
      }
      const rewardUsd = +utils.formatUnits(
        await rewardCalculator.strategyRewardsUsd(strategy, 60 * 60 * 24),
      );
      sum += rewardUsd;
      // console.log('strategy', strategy, name, await vaultCtr.name(), '===>', rewardUsd, ' sum: ', sum);
      console.log(await strCtr.platform(), rewardUsd);
      // expect(rewardUsd).is.not.eq(0);
    }
  });
});
