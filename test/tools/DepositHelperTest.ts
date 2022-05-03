import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DepositHelper, SmartVault} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MintHelperUtils} from "../MintHelperUtils";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {fetchJson} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Deposit Helper tests", function () {
  const MAX_UINT = BigNumber.from(2).pow(256).sub(1).toString();
  console.log('MAX_UINT', MAX_UINT);
  let targetVaultVersion: string;
  let snapshot: string;
  let snapshotForEach: string;
  let gov: SignerWithAddress;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let depositHelper: DepositHelper;
  let smartVaultImpl: SmartVault;
  let allVaults: string[];
  let timeLockSec: number;
  const passedVaults: string[] = [];

  // noinspection GrazieInspection
  const excludedVaults = [
      '0xf203b855b4303985b3dd3f35a9227828cc8cb009', // why no rewards received? // TODO belbix help me
      '0x4cd44ced63d9a6fef595f6ad3f7ced13fceac768', // QSS: Withdraw forbidden
  ]

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    gov = await DeployerUtils.impersonate();
    core = await DeployerUtils.getCoreAddressesWrapper(gov);

    depositHelper = await DeployerUtils.deployContract(signer, 'DepositHelper') as DepositHelper;
    smartVaultImpl = await DeployerUtils.deployContract(gov, 'SmartVault') as SmartVault;
    await core.controller.changeWhiteListStatus([depositHelper.address], true);

    targetVaultVersion = await smartVaultImpl.VERSION();
    console.log('targetVaultVersion', targetVaultVersion);
    timeLockSec = (await core.announcer.timeLock()).toNumber();


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


  it("Should deposit, claim and withdraw from vaults", async () => {
    const testVault = async (vaultAddress: string) => {
      console.log('-----------------------------------------------------');
      console.log('vaultAddress', vaultAddress);
      if (excludedVaults.includes(vaultAddress)) {
        console.log('Vault excluded.');
        return;
      }
      const vault = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
      const vaultActive = await vault.active();
      if (!vaultActive) {
        console.log('Vault inactive');
        return;
      }
      const rewardTokens = await vault.rewardTokens();
      if (rewardTokens.length === 0) {
        console.log('Vault no have reward tokens');
        return;
      }

      const vaultName = await vault.name();
      console.log('vaultName', vaultName);

      const vaultVersion = await vault.VERSION();
      console.log('vaultVersion', vaultVersion);

      // UPDATE VAULT IMPLEMENTATION
      if (vaultVersion !== targetVaultVersion) {
        console.log(`vaultVersion not eq ${targetVaultVersion} (${vaultVersion}). Updating...`);
        await core.announcer.announceTetuProxyUpgradeBatch([vaultAddress], [smartVaultImpl.address]);
        await TimeUtils.advanceBlocksOnTs(timeLockSec+1);
        await core.controller.upgradeTetuProxyBatch([vaultAddress], [smartVaultImpl.address]);
        const newVersion = await vault.VERSION();
        console.log('newVersion', newVersion);
        expect(newVersion).is.eq(targetVaultVersion);
      }

      // GET TOKENS FOR DEPOSIT
      const underlyingAddress = await vault.underlying();
      console.log('underlyingAddress', underlyingAddress);
      const decimals = await TokenUtils.decimals(underlyingAddress)
      console.log('decimals', decimals);

      let depositUnits = '100';
      if (underlyingAddress.toLowerCase() === MaticAddresses.WBTC_TOKEN) {
        depositUnits = '0.1';
      } else if ([MaticAddresses.WETH_TOKEN, MaticAddresses.cxETH_TOKEN].includes(underlyingAddress.toLowerCase())) {
        depositUnits = '1';
      }

      const amount = utils.parseUnits(depositUnits, decimals);
      const balanceInitial = await TokenUtils.balanceOf(underlyingAddress, signer.address);
      try {
        await TokenUtils.getToken(underlyingAddress, signer.address, amount);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Please add holder')) {
          console.warn(e.message + '\n- Skipping vault test');
          return
        } else throw e;
      }

      // DEPOSIT
      const balanceBefore = await TokenUtils.balanceOf(underlyingAddress, signer.address);
      await TokenUtils.approve(underlyingAddress, signer, depositHelper.address, amount.toString());
      console.log('depositToVault...');
      await depositHelper.depositToVault(vaultAddress, amount);
      const balanceAfter = await TokenUtils.balanceOf(underlyingAddress, signer.address);

      const sharesAmount = await TokenUtils.balanceOf(vaultAddress, signer.address);
      console.log('sharesAmount', sharesAmount.toString());

      // REWIND TIME
      const rewindTime = async function() {
        const rewindTimeSec = 7 * 24 * 60 * 60;
        console.log('rewindTimeSec', rewindTimeSec);
        await TimeUtils.advanceBlocksOnTs(rewindTimeSec);
      }

      // DISTRIBUTE REWARDS
      console.log('rewardTokens', rewardTokens);
      // const vaultGov = await DeployerUtils.connectInterface(gov, 'SmartVault', vaultAddress) as SmartVault;

      const distributeRewards = async function() {
        await rewindTime();
        for (const token of rewardTokens) {
          const tokenDecimals = await TokenUtils.decimals(token);
          const rewardAmount = utils.parseUnits('100', tokenDecimals);
          await TokenUtils.getToken(token, gov.address, rewardAmount);
          await TokenUtils.approve(token, gov, vaultAddress, rewardAmount.toString());
          await vault.connect(gov).notifyTargetRewardAmount(token, rewardAmount);
        }
      }

      Array(5).map(distributeRewards);

      // CHECK REWARDS
      const rewardBalancesBefore: {[key: string]: BigNumber} = {};
      for (const token of rewardTokens)
        rewardBalancesBefore[token] = await TokenUtils.balanceOf(token, signer.address);
      // console.log('rewardBalancesBefore', rewardBalancesBefore);

      // GET REWARDS
      await TokenUtils.approve(vaultAddress, signer, depositHelper.address, MAX_UINT);
      console.log('getAllRewards...');
      await depositHelper.getAllRewards(vaultAddress);

      const rewardBalancesAfter: {[key: string]: BigNumber} = {};
      for (const token of rewardTokens)
        rewardBalancesAfter[token] = await TokenUtils.balanceOf(token, signer.address);
      // console.log('rewardBalancesAfter', rewardBalancesAfter);

      const rewardAmounts = rewardTokens.map(
          (token) => rewardBalancesAfter[token].sub(rewardBalancesBefore[token])
      );
      console.log('rewardAmounts', rewardAmounts);
      const minRewards = rewardAmounts.reduce((min, curr) => curr.lt(min) ? curr : min);
      console.log('minRewards', minRewards.toString());

      // REWIND TIME AND DISTRIBUTE REWARDS AGAIN
      Array(5).map(distributeRewards);

      // WITHDRAW
      await TokenUtils.approve(vaultAddress, signer, depositHelper.address, MAX_UINT);
      console.log('withdrawFromVault...');
      await depositHelper.withdrawFromVault(vaultAddress, sharesAmount);
      const sharesAfter = await TokenUtils.balanceOf(vaultAddress, signer.address);

      // CHECK REWARDS AFTER WITHDRAW
      const rewardBalancesAfterWithdraw: {[key: string]: BigNumber} = {};
      for (const token of rewardTokens)
        rewardBalancesAfterWithdraw[token] = await TokenUtils.balanceOf(token, signer.address);
      console.log('rewardBalancesAfterWithdraw', rewardBalancesAfterWithdraw);

      const rewardAmountsAfterWithdraw = rewardTokens.map(
        (token) => rewardBalancesAfterWithdraw[token].sub(rewardBalancesAfter[token])
      );
      console.log('rewardAmountsAfterWithdraw', rewardAmountsAfterWithdraw);
      const minRewards2 = rewardAmountsAfterWithdraw.reduce((min, curr) => curr.lt(min) ? curr : min);
      console.log('minRewards2', minRewards2.toString());

      // EXPECTATIONS
      expect(balanceBefore.sub(balanceInitial)).is.eq(amount);
      expect(balanceAfter).is.eq(balanceInitial);
      expect(sharesAmount).is.gt(0);
      expect(sharesAfter).is.eq(0);
      expect(minRewards).is.gt(0);
      expect(minRewards2).is.gt(0);

      console.log('+++vault test passed', vaultAddress);
      passedVaults.push(vaultAddress);
    }

    // allVaults = await core.bookkeeper.vaults();
    const response: {active:boolean,users:number,strategyOnPause:boolean,tvl:number,addr:string}[] =
        await fetchJson({url:'https://api.tetu.io/api/v1/reader/vaultInfos?network=MATIC'});
    const filtered = response.filter(v => (v.active && (v.users>5) && !v.strategyOnPause && v.tvl>0));
    allVaults = filtered.map(v => v.addr);
    console.log('filtered allVaults.length', allVaults.length);
    const slicedVaults = allVaults.slice(-20); // n last vaults (some of that will be skipped with no biggest holder)
    console.log('slicedVaults.length', slicedVaults.length);
    for (const vault of slicedVaults) await testVault(vault);

    console.log('===============================');
    console.log('passedVaults length', passedVaults.length);

  });

  it("Should salvage token", async () => {

    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', signer.address);
    await TokenUtils.transfer(core.rewardToken.address, signer, depositHelper.address, utils.parseUnits("1000000").toString());
    const govBal = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);
    const bal = await TokenUtils.balanceOf(core.rewardToken.address, depositHelper.address);
    expect(bal.isZero()).is.eq(false);
    await depositHelper.salvage(core.rewardToken.address, bal);
    expect((await TokenUtils.balanceOf(core.rewardToken.address, depositHelper.address)).isZero()).is.eq(true);
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .is.eq(govBal.add(bal));
  });

});
