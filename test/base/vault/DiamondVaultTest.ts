import {ethers} from "hardhat";
import chai from "chai";
import {ContractReader, Multicall, MultiSwap, NoopStrategy, ZapContract} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {VaultUtils} from "../../VaultUtils";
import {utils} from "ethers";
import {Erc20Utils} from "../../Erc20Utils";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {MaticAddresses} from "../../MaticAddresses";
import {UniswapUtils} from "../../UniswapUtils";
import {MintHelperUtils} from "../../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

const LOCK_DURATION = 60 * 60 * 24 * 10;
const LOCK_PENALTY = 400;

describe("Diamond vault test", () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let contractReader: ContractReader;
  let zapContract: ZapContract;
  let multiSwap: MultiSwap;
  let multicall: Multicall;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);

    const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

    multicall = await DeployerUtils.deployContract(signer, "Multicall") as Multicall;
    const crLogic = await DeployerUtils.deployContract(signer, "ContractReader");
    const crProxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", crLogic.address);
    contractReader = crLogic.attach(crProxy.address) as ContractReader;

    await contractReader.initialize(core.controller.address, calculator.address);

    multiSwap = await DeployerUtils.deployMultiSwap(signer, core.controller.address, calculator.address);
    zapContract = (await DeployerUtils.deployZapContract(signer, core.controller.address, multiSwap.address));
    await core.controller.addToWhiteList(zapContract.address);

    await UniswapUtils.buyAllBigTokens(signer);
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


  it("check locked funds in loop", async () => {
    const underlying = core.psVault.address;


    // ******** DEPLOY VAULT *******
    const vault = await DeployerUtils.deploySmartVault(signer);
    const rt = vault.address;
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying], 1) as NoopStrategy;
    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        60 * 60 * 24 * 28,
        true
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await core.vaultController.addRewardTokens([vault.address], rt);
    await vault.setLockPenalty(LOCK_PENALTY);
    await vault.setLockPeriod(LOCK_DURATION);

    // ********** INIT VARS **************
    const user1 = (await ethers.getSigners())[1];
    const user2 = (await ethers.getSigners())[2];
    const user3 = (await ethers.getSigners())[3];
    const user4 = (await ethers.getSigners())[4];
    const user5 = (await ethers.getSigners())[5];
    const rtDecimals = await Erc20Utils.decimals(rt);
    const underlyingDec = await Erc20Utils.decimals(underlying);
    const duration = (await vault.duration()).toNumber();
    const time = 60 * 60 * 6;
    let rewardsToDistribute = utils.parseUnits('10000', rtDecimals);
    let rewardsTotalAmount = rewardsToDistribute;

    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', signer.address);
    await UniswapUtils.createPairForRewardToken(signer, core, '567111');
    await VaultUtils.deposit(signer, core.psVault, await Erc20Utils.balanceOf(core.rewardToken.address, signer.address));
    console.log('underlying amount', utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec));
    await VaultUtils.deposit(signer, vault, rewardsToDistribute.mul(2));
    await Erc20Utils.approve(rt, signer, vault.address, rewardsToDistribute.toString());
    await vault.notifyTargetRewardAmount(rt, rewardsToDistribute);


    const signerUndBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec);
    const signerDeposit = (signerUndBal * 0.1).toFixed(underlyingDec);
    let user1Deposit = (signerUndBal * 0.2).toFixed(underlyingDec);
    let user2Deposit = (signerUndBal * 0.3).toFixed(underlyingDec);
    let user3Deposit = (signerUndBal * 0.15).toFixed(underlyingDec);
    let user4Deposit = (signerUndBal * 0.05).toFixed(underlyingDec);
    let user5Deposit = (signerUndBal * 0.09).toFixed(underlyingDec);


    await Erc20Utils.transfer(underlying, signer, user1.address, utils.parseUnits(user1Deposit, underlyingDec).toString());
    await Erc20Utils.transfer(underlying, signer, user2.address, utils.parseUnits(user2Deposit, underlyingDec).toString());
    await Erc20Utils.transfer(underlying, signer, user3.address, utils.parseUnits(user3Deposit, underlyingDec).toString());
    await Erc20Utils.transfer(underlying, signer, user4.address, utils.parseUnits(user4Deposit, underlyingDec).toString());
    await Erc20Utils.transfer(underlying, signer, user5.address, utils.parseUnits(user5Deposit, underlyingDec).toString());

    // long holder
    await VaultUtils.deposit(user3, vault, utils.parseUnits(user3Deposit, underlyingDec));
    await VaultUtils.deposit(user4, vault, utils.parseUnits(user4Deposit, underlyingDec));
    await VaultUtils.deposit(user5, vault, utils.parseUnits(user5Deposit, underlyingDec));

    const signerUndBal2 = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec);

    //*************** CYCLES *************
    let claimedTotal = 0;
    const cyclesBase = +(duration / (time + 3)).toFixed(0);
    const cycles = cyclesBase * 2;
    const undSendPart = ((signerUndBal2 / cycles) * 0.99).toFixed(underlyingDec);
    console.log('cycles', cycles);
    let user1Deposited = false;
    let user1DepositedTime = 0;
    let user2Deposited = false;
    let user2DepositedTime = 0;

    let finish = (await vault.periodFinishForToken(rt)).toNumber();

    for (let i = 0; i < cycles; i++) {
      const ppfs = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);
      console.log('cycle', i, cycles, ppfs);
      console.log('ppfs', ppfs);


      if (i == 50) {
        console.log("!!!!!!!!!!add rewards", finish)
        await Erc20Utils.approve(rt, signer, vault.address, rewardsToDistribute.toString());
        await vault.notifyTargetRewardAmount(rt, rewardsToDistribute);
        rewardsTotalAmount = rewardsTotalAmount.add(rewardsToDistribute);
        finish = (await vault.periodFinishForToken(rt)).toNumber();
        console.log('ppfs after notify', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        console.log("!!!!!!!!!!end add rewards", finish)
      }

      if (i % 3 === 0) {
        if (user1Deposited) {
          console.log('--USER 1 EXIT');
          await vault.connect(user1).exit();
          const newDeposit = await printBalance(user1.address, underlying, underlyingDec, +user1Deposit, user1DepositedTime);
          const diff = +user1Deposit - +newDeposit;
          user1Deposit = newDeposit;
          rewardsTotalAmount = rewardsTotalAmount.add(utils.parseUnits(diff.toString(), underlyingDec));
          user1Deposited = false;
          console.log('ppfs after user1 exit', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        } else {
          console.log('--USER 1 DEPOSIT');
          await VaultUtils.deposit(user1, vault, utils.parseUnits(user1Deposit, underlyingDec));
          user1Deposited = true;
          user1DepositedTime = await TimeUtils.getBlockTime();
          console.log('user1DepositedTime', user1DepositedTime);
          console.log('ppfs after user 2 deposit', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        }
      }

      if (i % 5 === 0) {
        if (user2Deposited) {
          console.log('--USER 2 WITHDRAW');
          const user2Staked = await Erc20Utils.balanceOf(vault.address, user2.address);
          await vault.connect(user2).withdraw(user2Staked);
          const newDeposit = await printBalance(user2.address, underlying, underlyingDec, +user2Deposit, user2DepositedTime);
          const diff = +user2Deposit - +newDeposit;
          user2Deposit = newDeposit;
          rewardsTotalAmount = rewardsTotalAmount.add(utils.parseUnits(diff.toString(), underlyingDec));
          user2Deposited = false;
          console.log('ppfs after user2 withdraw', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        } else {
          console.log('--USER 2 DEPOSIT');
          await VaultUtils.deposit(user2, vault, utils.parseUnits(user2Deposit, underlyingDec));
          user2Deposited = true;
          console.log('ppfs after user 2 deposit', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
          user2DepositedTime = await TimeUtils.getBlockTime();
          console.log('user1DepositedTime', user2DepositedTime);
        }
      }

      // ! TIME MACHINE BRRRRRRR
      await TimeUtils.advanceBlocksOnTs(time);

      console.log('ppfs after time machine', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));

      console.log('vaultApr', await VaultUtils.vaultApr(vault, rt, contractReader),
          utils.formatUnits((await contractReader.vaultRewardsApr(vault.address))[0]));
      console.log('rewardPerToken', utils.formatUnits(await vault.rewardPerToken(rt)));


      const vaultRtBalance = +utils.formatUnits(await Erc20Utils.balanceOf(rt, vault.address), rtDecimals);

      const rtBalanceUser5 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user5.address), rtDecimals);
      const toClaimUser5 = +utils.formatUnits(await vault.earnedWithBoost(rt, user5.address), rtDecimals);
      const toClaimUser5FullBoost = +utils.formatUnits(await vault.earned(rt, user5.address), rtDecimals);

      const rtBalanceUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals);
      const toClaimUser1 = +utils.formatUnits(await vault.earnedWithBoost(rt, user1.address), rtDecimals);
      const toClaimUser1FullBoost = +utils.formatUnits(await vault.earned(rt, user1.address), rtDecimals);

      const rtBalanceUser2 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user2.address), rtDecimals);
      const toClaimUser2 = +utils.formatUnits(await vault.earnedWithBoost(rt, user2.address), rtDecimals);
      const toClaimUser2FullBoost = +utils.formatUnits(await vault.earned(rt, user2.address), rtDecimals);

      const toClaimUser3FullBoost = +utils.formatUnits(await vault.earned(rt, user3.address), rtDecimals);
      const toClaimUser3 = +utils.formatUnits(await vault.earnedWithBoost(rt, user3.address), rtDecimals);

      console.log('User5 toClaim', toClaimUser5, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalanceUser5, 'full boost', toClaimUser5FullBoost);
      console.log('User1 toClaim', toClaimUser1, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalanceUser1, 'full boost', toClaimUser1FullBoost);
      console.log('User2 toClaim', toClaimUser2, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalanceUser2, 'full boost', toClaimUser2FullBoost);
      console.log('User3 toClaim', toClaimUser3, '100% boost', toClaimUser3FullBoost);

      expect(toClaimUser5).is.greaterThan(0, 'to claim is zero ' + i);
      if (user1Deposited) {
        expect(toClaimUser1).is.greaterThan(0, 'to claim is zero ' + i);
      }
      if (user2Deposited) {
        expect(toClaimUser2).is.greaterThan(0, 'to claim is zero ' + i);
      }


      await vault.connect(user5).getAllRewards();
      const claimedUser5 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user5.address), rtDecimals) - rtBalanceUser5;
      claimedTotal += claimedUser5;
      expect(claimedUser5).is.greaterThan(0);
      expect(toClaimUser5).is.approximately(claimedUser5, claimedUser5 * 0.01, 'user5 claimed not enough ' + i);

      console.log('ppfs after user 5 claim', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));

      if (user2Deposited) {
        await vault.connect(user2).getAllRewards();
        const claimedUser2 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user2.address), rtDecimals) - rtBalanceUser2;
        claimedTotal += claimedUser2;
        expect(claimedUser2).is.greaterThan(0, 'user 2 claimed zero');
        expect(toClaimUser2).is.approximately(claimedUser2, claimedUser2 * 0.01, 'user2 claimed not enough ' + i);
      }

      if (i !== 0 && (i % +((cycles / 2).toFixed()) === 0)) {
        const rtBalanceUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals);
        await vault.connect(user3).getAllRewards();
        const claimedUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals) - rtBalanceUser3;
        claimedTotal += claimedUser3;
        console.log('claimedUser3', claimedUser3);
        expect(claimedUser3).is.greaterThan(0, 'user 3 claimed zero');
        expect(toClaimUser3).is.approximately(claimedUser3, claimedUser3 * 0.01, 'user3 claimed not enough ' + i);
      }


      // ppfs change test
      const ppfsAfter = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);
      expect(ppfsAfter).eq(ppfs);
      console.log('claimedTotal', claimedTotal, +utils.formatUnits(rewardsTotalAmount, rtDecimals));

      if ((await multicall.getCurrentBlockTimestamp()).toNumber() > finish) {
        console.log('cycles ended', i);
        break;
      }

    }

    // other users should claim without penalty
    await TimeUtils.advanceBlocksOnTs(LOCK_DURATION);

    const toClaimUser3FullBoost = +utils.formatUnits(await vault.earned(rt, user3.address), rtDecimals);
    const toClaimUser3 = +utils.formatUnits(await vault.earnedWithBoost(rt, user3.address), rtDecimals);
    console.log('User3 toClaim', toClaimUser3, '100% boost', toClaimUser3FullBoost);
    const rtBalanceUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals);
    await vault.connect(user3).getAllRewards();
    const claimedUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals) - rtBalanceUser3;
    claimedTotal += claimedUser3;
    console.log('claimedUser3', claimedUser3);
    expect(claimedUser3).is.greaterThan(0);
    expect(toClaimUser3).is.approximately(claimedUser3, claimedUser3 * 0.01, 'user3 claimed not enough');

    const toClaimUser4FullBoost = +utils.formatUnits(await vault.earned(rt, user4.address), rtDecimals);
    const toClaimUser4 = +utils.formatUnits(await vault.earnedWithBoost(rt, user4.address), rtDecimals);
    console.log('User4 toClaim', toClaimUser4, '100% boost', toClaimUser4FullBoost);
    const rtBalanceUser4 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user4.address), rtDecimals);
    await vault.connect(user4).getAllRewards();
    const claimedUser4 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user4.address), rtDecimals) - rtBalanceUser4;
    claimedTotal += claimedUser4;
    console.log('claimedUser4', claimedUser4);
    expect(claimedUser4).is.greaterThan(0);
    expect(toClaimUser4).is.approximately(claimedUser4, claimedUser4 * 0.01, 'user4 claimed not enough');

    const vaultRtBalance = +utils.formatUnits(await Erc20Utils.balanceOf(rt, vault.address), rtDecimals);
    console.log('vaultRtBalance', vaultRtBalance);
    const controllerBal = +utils.formatUnits(await Erc20Utils.balanceOf(rt, core.controller.address), rtDecimals);
    console.log('controller bal', controllerBal);

    console.log('claimedTotal with contr', claimedTotal + controllerBal, +utils.formatUnits(rewardsTotalAmount, rtDecimals));

    expect(claimedTotal + controllerBal).is.approximately(+utils.formatUnits(rewardsTotalAmount, rtDecimals),
        +utils.formatUnits(rewardsTotalAmount, rtDecimals) * 0.01, 'total claimed not enough');
  });

});

async function printBalance(
    userAdr: string,
    underlying: string,
    underlyingDec: number,
    prevDeposit: number,
    depositedTime: number
): Promise<string> {
  const curBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, userAdr), underlyingDec);
  const currentLockDuration = Math.floor(Date.now() / 1000) - depositedTime;
  const sharesBase = prevDeposit * (1000 - LOCK_PENALTY) / 1000;
  const toWithdraw = sharesBase + ((prevDeposit - sharesBase) * currentLockDuration / LOCK_DURATION);
  console.log('-- USER BALANCE--------------------');
  console.log('-- Current balance  ', curBal);
  console.log('-- Previous balance ', prevDeposit);
  console.log('-- Balance diff     ', prevDeposit - curBal);
  console.log('-- Diff %           ', (prevDeposit - curBal) / prevDeposit * 100);
  console.log('-- currentLockDur   ', currentLockDuration);
  console.log('-- sharesBase       ', sharesBase);
  console.log('-- toWithdraw       ', toWithdraw);
  console.log('-- expected diff    ', curBal - toWithdraw);
  console.log('-- expected diff %  ', (curBal - toWithdraw) / curBal * 100);
  console.log('------------------------------------');
  return Math.floor(curBal).toFixed();
}
