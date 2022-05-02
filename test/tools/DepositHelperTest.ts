import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers, network} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DepositHelper, SmartVault} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MintHelperUtils} from "../MintHelperUtils";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Deposit Helper tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let gov: SignerWithAddress;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let depositHelper: DepositHelper;
  let allVaults: string[];

  const excludedVaults = [
      '0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33', // no biggest holder: reverted with reason string 'BAL#406'
      '0x116810f5dE147bB522BECBAA62aDF20d59677f17' // on deposit reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)
  ]

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    gov = await DeployerUtils.impersonate();
    core = await DeployerUtils.getCoreAddressesWrapper(gov);

    depositHelper = await DeployerUtils.deployContract(signer, 'DepositHelper') as DepositHelper;
    await core.controller.changeWhiteListStatus([depositHelper.address], true);

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


  it("Should deposit and withdraw from vaults", async () => {
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
          console.warn(e.message + ' - Skipping vault test');
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

      // REWIND RIME
      const rewindTime = async function() {
        const rewindTimeSec = 7 * 24 * 60 * 60;
        console.log('rewindTimeSec', rewindTimeSec);
        await TimeUtils.advanceBlocksOnTs(rewindTimeSec);
      }
      await rewindTime();

      // DISTRIBUTE REWARDS
      const rewardTokens = await vault.rewardTokens();
      console.log('rewardTokens', rewardTokens);
      // const vaultGov = await DeployerUtils.connectInterface(gov, 'SmartVault', vaultAddress) as SmartVault;

      const distributeRewards = async function() {
        await rewindTime();
        for (const token of rewardTokens) {
          const tokenDecimals = await TokenUtils.decimals(token);
          const rewardAmount = utils.parseUnits('10000', tokenDecimals);
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
      console.log('rewardBalancesBefore', rewardBalancesBefore);

      const toClaim: {[key: string]: BigNumber} = {};
      for (const token of rewardTokens) {
        toClaim[token] = await vault.earned(token, signer.address);
        console.log('toClaim', token, toClaim[token]);
      }
      console.log('getAllRewards...');
      // await depositHelper.getAllRewards(vaultAddress);
      await vault.getAllRewards();

      const rewardBalancesAfter: {[key: string]: BigNumber} = {};
      for (const token of rewardTokens)
        rewardBalancesAfter[token] = await TokenUtils.balanceOf(token, signer.address);
      console.log('rewardBalancesAfter', rewardBalancesAfter);

      const rewardAmounts = rewardTokens.map(
          (token) => rewardBalancesAfter[token].sub(rewardBalancesBefore[token])
      );
      console.log('rewardAmounts', rewardAmounts);
      const minRewards = rewardAmounts.reduce((min, curr) => curr.lt(min) ? curr : min);
      console.log('minRewards', minRewards);

      // REWIND TIME AND DISTRIBUTE REWARDS AGAIN
      Array(5).map(distributeRewards);

      // WITHDRAW
      await TokenUtils.approve(vaultAddress, signer, depositHelper.address, sharesAmount.toString());
      console.log('withdrawFromVault...');
      await depositHelper.withdrawFromVault(vaultAddress, sharesAmount);
      const sharesAfter = await TokenUtils.balanceOf(vaultAddress, signer.address);

      await vault.getAllRewards(); // TODO remove

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
      console.log('minRewards2', minRewards2);

      // EXPECTATIONS
      expect(balanceBefore.sub(balanceInitial)).is.eq(amount);
      expect(balanceAfter).is.eq(balanceInitial);
      expect(sharesAmount).is.gt(0);
      expect(sharesAfter).is.eq(0);
      expect(minRewards).is.gt(0);
      expect(minRewards2).is.gt(0);

      console.log('+++vault test passed', vaultAddress);
    }

    allVaults = await core.bookkeeper.vaults();
    console.log('allVaults.length', allVaults.length);
    const slicedVaults = allVaults.slice(-10); // n last vaults (some of that will be skipped with no biggest holder)
    for (const vault of slicedVaults) await testVault(vault);

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
