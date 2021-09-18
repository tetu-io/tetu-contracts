import {ethers} from "hardhat";
import chai from "chai";
import {
  ContractReader,
  Multicall,
  MultiSwap,
  NoopStrategy,
  SmartVault,
  ZapContract
} from "../../../typechain";
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

const LOCK_DURATION = 60 * 60 * 24 * 3;
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
        true,
        MaticAddresses.ZERO_ADDRESS
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

    // long holders
    await VaultUtils.deposit(user3, vault, utils.parseUnits(user3Deposit, underlyingDec));

    const lockTsUser3 = await vault.userLockTs(user3.address);
    const lockTsUser4 = await vault.userLockTs(user4.address);
    expect(lockTsUser4).is.eq(0);
    const bal = await Erc20Utils.balanceOf(vault.address, user3.address);
    await Erc20Utils.transfer(vault.address, user3, user4.address, bal.div(100).toString());
    user3Deposit = (+user3Deposit - (+user3Deposit / 100)).toString()
    const lockTsUser3After = await vault.userLockTs(user3.address);
    const lockTsUser4After = await vault.userLockTs(user4.address);

    expect(lockTsUser3).is.eq(lockTsUser3After);
    expect(lockTsUser4After).is.not.eq(0);

    await VaultUtils.deposit(user4, vault, utils.parseUnits(user4Deposit, underlyingDec));
    user4Deposit = (+user4Deposit + (+user3Deposit / 100)).toString()
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

          const bal = +utils.formatUnits(await vault.underlyingBalanceWithInvestmentForHolder(user1.address));
          console.log('bal', bal);

          const toClaim = +utils.formatUnits(await vault.earnedWithBoost(rt, user1.address), rtDecimals);
          console.log('toClaim', toClaim);
          await vault.connect(user1).getAllRewards();


          await vault.connect(user1).exit();
          const lastWithdrawTs = (await vault.userLastWithdrawTs(user1.address)).toNumber();

          const curBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, user1.address), underlyingDec);
          const newDeposit = await printBalance(user1.address, underlying, underlyingDec,
              curBal,
              bal, // user claim rewards and withdraw it when exit
              (await vault.userLastDepositTs(user1.address)).toNumber(),
              lastWithdrawTs
          );
          const diff = bal - +newDeposit;
          console.log('--USER 1 diff', diff, bal, toClaim, newDeposit);
          user1Deposit = newDeposit;
          rewardsTotalAmount = rewardsTotalAmount.add(utils.parseUnits(diff.toString(), underlyingDec));
          user1Deposited = false;
          //we can't calculate accurate value for exit cos it withdraw immediately
          claimedTotal += toClaim;
        } else {
          console.log('--USER 1 DEPOSIT');
          await VaultUtils.deposit(user1, vault, utils.parseUnits(user1Deposit, underlyingDec));
          user1Deposited = true;
          user1DepositedTime = await TimeUtils.getBlockTime();
          console.log('user1DepositedTime', user1DepositedTime);
        }
      }

      if (i % 5 === 0) {
        if (user2Deposited) {
          console.log('--USER 2 WITHDRAW');
          const user2Staked = await Erc20Utils.balanceOf(vault.address, user2.address);
          const bal = +utils.formatUnits(await vault.underlyingBalanceWithInvestmentForHolder(user2.address));
          await vault.connect(user2).withdraw(user2Staked);
          const curBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, user2.address), underlyingDec);
          const newDeposit = await printBalance(user2.address, underlying, underlyingDec,
              curBal,
              bal,
              (await vault.userLastDepositTs(user2.address)).toNumber(),
              (await vault.userLastWithdrawTs(user2.address)).toNumber()
          );
          const diff = bal - +newDeposit;
          console.log('--USER 2 diff', diff, bal, newDeposit);
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

      if (i % 3 === 0) {
        const lockTsUser3 = await vault.userLockTs(user3.address);
        const lockTsUser4 = await vault.userLockTs(user4.address);
        const bal = await Erc20Utils.balanceOf(vault.address, user3.address);
        await Erc20Utils.transfer(vault.address, user3, user4.address, bal.div(100).toString());

        const lockTsUser3After = await vault.userLockTs(user3.address);
        const lockTsUser4After = await vault.userLockTs(user4.address);
        user3Deposit = (+user3Deposit - (+user3Deposit / 100)).toString()
        user4Deposit = (+user4Deposit + (+user3Deposit / 100)).toString()
        expect(lockTsUser3).is.eq(lockTsUser3After);
        expect(lockTsUser4).is.eq(lockTsUser4After);
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
        user3Deposit = (+user3Deposit + claimedUser3).toString();
        console.log('claimedUser3', claimedUser3);
        expect(claimedUser3).is.greaterThan(0, 'user 3 claimed zero');
        expect(toClaimUser3).is.approximately(claimedUser3, claimedUser3 * 0.01, 'user3 claimed not enough ' + i);
      }


      // ppfs change test
      const ppfsAfter = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);
      expect(ppfsAfter).eq(ppfs);
      console.log('claimedTotal', claimedTotal, +utils.formatUnits(rewardsTotalAmount, rtDecimals));

      const vaultToClaim = +utils.formatUnits(await vault.earnedWithBoost(rt, vault.address), rtDecimals);
      console.log('vaultToClaim', vaultToClaim);
      // expect(vaultToClaim).is.eq(0);

      if ((await multicall.getCurrentBlockTimestamp()).toNumber() > finish) {
        console.log('cycles ended', i);
        break;
      }

    }

    // other users should withdraw without penalty
    await TimeUtils.advanceBlocksOnTs(LOCK_DURATION);

    const toClaimUser1FullBoost = +utils.formatUnits(await vault.earned(rt, user1.address), rtDecimals);
    const toClaimUser1 = +utils.formatUnits(await vault.earnedWithBoost(rt, user1.address), rtDecimals);
    console.log('User1 toClaim', toClaimUser1, '100% boost', toClaimUser1FullBoost);
    const rtBalanceUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals);
    await vault.connect(user1).getAllRewards();
    const claimedUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals) - rtBalanceUser1;
    claimedTotal += claimedUser1;

    const toClaimUser3FullBoost = +utils.formatUnits(await vault.earned(rt, user3.address), rtDecimals);
    const toClaimUser3 = +utils.formatUnits(await vault.earnedWithBoost(rt, user3.address), rtDecimals);
    console.log('User3 toClaim', toClaimUser3, '100% boost', toClaimUser3FullBoost);
    const rtBalanceUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals);
    await vault.connect(user3).getAllRewards();
    const claimedUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals) - rtBalanceUser3;
    claimedTotal += claimedUser3;
    user3Deposit = (+user3Deposit + claimedUser3).toString();
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
    user4Deposit = (+user4Deposit + claimedUser4).toString();
    console.log('claimedUser4', claimedUser4);
    expect(claimedUser4).is.greaterThan(0);
    expect(toClaimUser4).is.approximately(claimedUser4, claimedUser4 * 0.01, 'user4 claimed not enough');

    const toClaimSignerFullBoost = +utils.formatUnits(await vault.earned(rt, signer.address), rtDecimals);
    const toClaimSigner = +utils.formatUnits(await vault.earnedWithBoost(rt, signer.address), rtDecimals);
    console.log('signer toClaim', toClaimSigner, '100% boost', toClaimSignerFullBoost);
    const rtBalanceSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals);
    await vault.getAllRewards();
    const claimedSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals) - rtBalanceSigner;
    claimedTotal += claimedSigner;
    console.log('claimedSigner', claimedSigner);
    expect(claimedSigner).is.greaterThan(0);
    expect(toClaimSigner).is.approximately(claimedSigner, claimedSigner * 0.01, 'signer claimed not enough');

    console.log('vaultRtBalance before all exit', +utils.formatUnits(await Erc20Utils.balanceOf(rt, vault.address), rtDecimals));

    await exit(vault, signer);
    await exit(vault, user1);
    await exit(vault, user2);
    await exit(vault, user3);
    await exit(vault, user4);
    await exit(vault, user5);

    expect(+utils.formatUnits(await Erc20Utils.balanceOf(underlying, user3.address), underlyingDec))
    .is.approximately(+user3Deposit, +user3Deposit * 0.01);
    expect(+utils.formatUnits(await Erc20Utils.balanceOf(underlying, user4.address), underlyingDec))
    .is.approximately(+user4Deposit, +user4Deposit * 0.01);

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
    curBal: number,
    prevBal: number,
    depositedTime: number,
    withdrawTime: number
): Promise<string> {
  const currentLockDuration = withdrawTime - depositedTime;
  const sharesBase = prevBal * (1000 - LOCK_PENALTY) / 1000;
  const toWithdraw = sharesBase + ((prevBal - sharesBase) * currentLockDuration / LOCK_DURATION);
  console.log('-- USER BALANCE--------------------');
  console.log('-- Current balance  ', curBal);
  console.log('-- Previous balance ', prevBal);
  console.log('-- Balance diff     ', prevBal - curBal);
  console.log('-- Diff %           ', (prevBal - curBal) / prevBal * 100);
  console.log('-----   ');
  console.log('-- depositedTime    ', depositedTime);
  console.log('-- withdrawTime     ', withdrawTime);
  console.log('-- currentLockDur   ', currentLockDuration);
  console.log('-- sharesBase       ', sharesBase);
  console.log('-- toWithdraw       ', toWithdraw);
  console.log('-- expected diff    ', curBal - toWithdraw);
  console.log('-- expected diff %  ', (curBal - toWithdraw) / curBal * 100);
  console.log('------------------------------------');
  expect(toWithdraw).is.approximately(curBal, curBal * 0.1);
  return Math.floor(curBal).toFixed();
}

async function exit(vault: SmartVault, user: SignerWithAddress) {
  if (!(await Erc20Utils.balanceOf(vault.address, user.address)).isZero()) {
    await vault.connect(user).exit();
  }
}