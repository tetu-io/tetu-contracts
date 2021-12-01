import {ethers} from "hardhat";
import chai from "chai";
import {ContractReader, Multicall, NoopStrategy, SmartVault} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {VaultUtils} from "../../VaultUtils";
import {utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {UniswapUtils} from "../../UniswapUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";

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
  let multicall: Multicall;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    // core = await DeployerUtils.getCoreAddressesWrapper(signer);
    core = await DeployerUtils.deployAllCoreContracts(signer);

    const calculator = (await DeployerUtils.deployPriceCalculator(signer, core.controller.address))[0];

    multicall = await DeployerUtils.deployContract(signer, "Multicall") as Multicall;
    const crLogic = await DeployerUtils.deployContract(signer, "ContractReader");
    const crProxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", crLogic.address);
    contractReader = crLogic.attach(crProxy.address) as ContractReader;

    await contractReader.initialize(core.controller.address, calculator.address);
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
    console.log('vault.address', vault.address);
    const rt = vault.address;
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller.address, underlying, vault.address, [Misc.ZERO_ADDRESS], [underlying], 1) as NoopStrategy;
    await vault.initializeSmartVault(
      "NOOP",
      "tNOOP",
      core.controller.address,
      underlying,
      60 * 60 * 24 * 28,
      true,
      rt
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await vault.setLockPenalty(LOCK_PENALTY);
    await vault.setLockPeriod(LOCK_DURATION);

    // ********** INIT VARS **************
    const user1 = (await ethers.getSigners())[1];
    const user2 = (await ethers.getSigners())[2];
    const rtDecimals = await TokenUtils.decimals(rt);
    const underlyingDec = await TokenUtils.decimals(underlying);
    const duration = (await vault.duration()).toNumber();
    const time = 60 * 60 * 6;
    const rewardsToDistribute = utils.parseUnits('10000', rtDecimals);
    let rewardsTotalAmount = rewardsToDistribute;

    await UniswapUtils.createPairForRewardToken(signer, core, '567111');
    await VaultUtils.deposit(signer, core.psVault, await TokenUtils.balanceOf(core.rewardToken.address, signer.address));
    console.log('underlying amount', utils.formatUnits(await TokenUtils.balanceOf(underlying, signer.address), underlyingDec));
    await VaultUtils.deposit(signer, vault, rewardsToDistribute.mul(2).add(1));
    await TokenUtils.approve(rt, signer, vault.address, rewardsToDistribute.toString());
    await vault.notifyTargetRewardAmount(rt, rewardsToDistribute);


    const signerUndBal = +utils.formatUnits(await TokenUtils.balanceOf(underlying, signer.address), underlyingDec);
    let user1Balance = +(signerUndBal * 0.2).toFixed(underlyingDec);
    let user2Balance = +(signerUndBal * 0.3).toFixed(underlyingDec);

    await TokenUtils.transfer(underlying, signer, user1.address, utils.parseUnits(user1Balance.toString(), underlyingDec).toString());
    await TokenUtils.transfer(underlying, signer, user2.address, utils.parseUnits(user2Balance.toString(), underlyingDec).toString());

    // *************** CYCLES *************
    let claimedTotal = 0;
    const cyclesBase = +(duration / (time + 3)).toFixed(0);
    const cycles = cyclesBase * 2;
    console.log('cycles', cycles);
    let user1Deposited = false;
    let user2Deposited = false;

    let finish = (await vault.periodFinishForToken(rt)).toNumber();

    for (let i = 0; i < cycles; i++) {
      const ppfs = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);
      console.log('cycle', i, cycles, ppfs);

      if (i === 50) {
        console.log("!!!!!!!!!!add rewards", finish)
        await TokenUtils.approve(rt, signer, vault.address, rewardsToDistribute.toString());
        await vault.notifyTargetRewardAmount(rt, rewardsToDistribute);
        rewardsTotalAmount = rewardsTotalAmount.add(rewardsToDistribute);
        finish = (await vault.periodFinishForToken(rt)).toNumber();
        console.log('ppfs after notify', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        console.log("!!!!!!!!!!end add rewards", finish)
      }

      if (i % 3 === 0) {
        if (user1Deposited) {
          console.log('--USER 1 EXIT');

          const claimed = await claim(vault, user1, 'user1');
          user1Balance += claimed;
          claimedTotal += claimed;

          const undBalBeforeExit = +utils.formatUnits(await vault.underlyingBalanceWithInvestmentForHolder(user1.address), underlyingDec);
          expect(+user1Balance).is.approximately(undBalBeforeExit, undBalBeforeExit * 0.001);

          await vault.connect(user1).exit();
          expect((await vault.underlyingBalanceWithInvestmentForHolder(user1.address)).isZero()).is.eq(true);
          const lastWithdrawTs = (await vault.userLastWithdrawTs(user1.address)).toNumber();

          const curUndBal = +utils.formatUnits(await TokenUtils.balanceOf(underlying, user1.address), underlyingDec);
          await printBalance(user1.address, underlying, underlyingDec,
            curUndBal,
            undBalBeforeExit, // user claim rewards and withdraw it when exit
            (await vault.userLastDepositTs(user1.address)).toNumber(),
            lastWithdrawTs
          );
          const diff = undBalBeforeExit - curUndBal;
          console.log('--USER 1 diff', diff, user1Balance, curUndBal);
          user1Balance = curUndBal;
          rewardsTotalAmount = rewardsTotalAmount.add(utils.parseUnits(diff.toString(), underlyingDec));
          user1Deposited = false;
        } else {
          console.log('--USER 1 DEPOSIT');
          await VaultUtils.deposit(user1, vault, utils.parseUnits(Math.floor(user1Balance).toString(), underlyingDec));
          user1Deposited = true;
        }
      }

      if (i % 5 === 0) {
        if (user2Deposited) {
          console.log('--USER 2 WITHDRAW');
          const user2Staked = await TokenUtils.balanceOf(vault.address, user2.address);
          const bal = +utils.formatUnits(await vault.underlyingBalanceWithInvestmentForHolder(user2.address));
          await vault.connect(user2).withdraw(user2Staked);
          const curBal = +utils.formatUnits(await TokenUtils.balanceOf(underlying, user2.address), underlyingDec);
          const newDeposit = await printBalance(user2.address, underlying, underlyingDec,
            curBal,
            bal,
            (await vault.userLastDepositTs(user2.address)).toNumber(),
            (await vault.userLastWithdrawTs(user2.address)).toNumber()
          );
          const diff = bal - +newDeposit;
          console.log('--USER 2 diff', diff, bal, newDeposit);
          user2Balance = curBal;
          rewardsTotalAmount = rewardsTotalAmount.add(utils.parseUnits(diff.toString(), underlyingDec));
          user2Deposited = false;
          console.log('ppfs after user2 withdraw', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));
        } else {
          console.log('--USER 2 DEPOSIT');
          await VaultUtils.deposit(user2, vault, utils.parseUnits(Math.floor(user2Balance).toString(), underlyingDec));
          user2Deposited = true;
        }
      }

      // ! TIME MACHINE BRRRRRRR
      await TimeUtils.advanceBlocksOnTs(time);

      console.log('ppfs after time machine', +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec));

      console.log('vaultApr', await VaultUtils.vaultApr(vault, rt, contractReader),
        utils.formatUnits((await contractReader.vaultRewardsApr(vault.address))[0]));
      console.log('rewardPerToken', utils.formatUnits(await vault.rewardPerToken(rt)));

      if (user1Deposited) {
        const toClaimUser1 = +utils.formatUnits(await vault.earnedWithBoost(rt, user1.address), rtDecimals);
        expect(toClaimUser1).is.greaterThan(0, 'to claim is zero ' + i);
      }

      if (user2Deposited) {
        const claimed = await claim(vault, user2, 'user2');
        user2Balance += claimed;
        claimedTotal += claimed;
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

    claimedTotal += await claim(vault, user1, 'user1', true);
    claimedTotal += await claim(vault, user2, 'user2', true);
    claimedTotal += await claim(vault, signer, 'signer', true);

    console.log('vaultRtBalance before all exit', +utils.formatUnits(await TokenUtils.balanceOf(rt, vault.address), rtDecimals));

    await exit(vault, signer);
    await exit(vault, user1);
    await exit(vault, user2);

    const vaultRtBalance = +utils.formatUnits(await TokenUtils.balanceOf(rt, vault.address), rtDecimals);
    console.log('vaultRtBalance', vaultRtBalance);
    const controllerBal = +utils.formatUnits(await TokenUtils.balanceOf(rt, core.controller.address), rtDecimals);
    console.log('controller bal', controllerBal);
    console.log('controller earned', utils.formatUnits(await vault.earned(vault.address, core.controller.address), underlyingDec));
    console.log('vault earned', utils.formatUnits(await vault.earned(vault.address, vault.address), underlyingDec));

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
  console.log('-- currentLockDur   ', currentLockDuration, (currentLockDuration / 60 / 60).toFixed(2));
  console.log('-- sharesBase       ', sharesBase);
  console.log('-- toWithdraw       ', toWithdraw);
  console.log('-- expected diff    ', curBal - toWithdraw);
  console.log('-- expected diff %  ', ((curBal - toWithdraw) / curBal * 100).toFixed(4));
  console.log('------------------------------------');
  expect(toWithdraw).is.approximately(curBal, curBal * 0.1);
  return Math.floor(curBal).toFixed();
}

async function exit(vault: SmartVault, user: SignerWithAddress) {
  const bal = await TokenUtils.balanceOf(vault.address, user.address);
  if (!bal.isZero()) {
    console.log('exit', utils.formatUnits(bal));
    await vault.connect(user).exit();
  }
}

async function claim(
  vault: SmartVault,
  signer: SignerWithAddress,
  name: string,
  allowedZero = false
) {
  const rt = (await vault.rewardTokens())[0];
  const rtDecimals = await TokenUtils.decimals(rt);

  const toClaimSignerFullBoost = +utils.formatUnits(await vault.earned(rt, signer.address), rtDecimals);
  const toClaimSigner = +utils.formatUnits(await vault.earnedWithBoost(rt, signer.address), rtDecimals);

  if (toClaimSigner === 0 && allowedZero) {
    return 0;
  }

  const rtBalanceSigner = +utils.formatUnits(await TokenUtils.balanceOf(rt, signer.address), rtDecimals);
  console.log(name, 'toClaim', toClaimSigner, '100% boost', toClaimSignerFullBoost);

  await vault.connect(signer).getAllRewards();

  const claimedSigner = +utils.formatUnits(await TokenUtils.balanceOf(rt, signer.address), rtDecimals) - rtBalanceSigner;
  console.log(name, 'claimed', claimedSigner);
  expect(claimedSigner).is.greaterThan(0);
  expect(toClaimSigner).is.approximately(claimedSigner, claimedSigner * 0.01, name + ' claimed not enough');
  return claimedSigner;
}
