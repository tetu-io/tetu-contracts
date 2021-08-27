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
import {ZapUtils} from "../../ZapUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Smart vault rewards test", () => {
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


  it("check reward vesting for multiple accounts with SUSHI rewards and LP underlying", async () => {
    const underlying = await UniswapUtils.addLiquidity(signer, MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN,
        utils.parseUnits('10000').toString(), utils.parseUnits('10000', 6).toString(),
        MaticAddresses.SUSHI_FACTORY, MaticAddresses.SUSHI_ROUTER);

    const rt = MaticAddresses.SUSHI_TOKEN;

    // ******** DEPLOY VAULT *******
    const vault = await DeployerUtils.deploySmartVault(signer);
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN]) as NoopStrategy;
    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        60 * 60 * 24 * 28
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await core.vaultController.addRewardTokens([vault.address], rt);

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
    let rewardsTotalAmount = utils.parseUnits('10000', rtDecimals);

    console.log('underlying amount', utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec));

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, rt, utils.parseUnits('300'), MaticAddresses.WETH_TOKEN);
    await Erc20Utils.approve(rt, signer, vault.address, rewardsTotalAmount.toString());
    await vault.notifyTargetRewardAmount(rt, rewardsTotalAmount);


    const signerUndBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec);
    const signerDeposit = (signerUndBal * 0.1).toFixed(underlyingDec);
    const user1Deposit = (signerUndBal * 0.2).toFixed(underlyingDec);
    const user2Deposit = (signerUndBal * 0.3).toFixed(underlyingDec);
    const user3Deposit = (signerUndBal * 0.15).toFixed(underlyingDec);
    const user4Deposit = (signerUndBal * 0.05).toFixed(underlyingDec);
    const user5Deposit = (signerUndBal * 0.09).toFixed(underlyingDec);


    await Erc20Utils.transfer(underlying, signer, user1.address, utils.parseUnits(user1Deposit, underlyingDec).toString());
    await Erc20Utils.transfer(MaticAddresses.WMATIC_TOKEN, signer, user2.address, utils.parseUnits('10000').toString());
    // await Erc20Utils.transfer(underlying, signer, user2.address, utils.parseUnits(user2Deposit, underlyingDec).toString());
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
    let user2Deposited = false;

    let finish = (await vault.periodFinishForToken(rt)).toNumber();

    for (let i = 0; i < cycles; i++) {
      console.log('cycle', i, cycles);
      const ppfs = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);

      if (i == 50) {
        console.log("!!!!!!!!!!add rewards", finish)
        await Erc20Utils.approve(rt, signer, vault.address, rewardsTotalAmount.toString());
        await vault.notifyTargetRewardAmount(rt, rewardsTotalAmount);
        rewardsTotalAmount = rewardsTotalAmount.mul(2);
        finish = (await vault.periodFinishForToken(rt)).toNumber();
        console.log("!!!!!!!!!!end add rewards", finish)
      }

      if (i % 3 === 0) {
        if (user1Deposited) {
          await vault.connect(user1).exit();
          user1Deposited = false;
        } else {
          await VaultUtils.deposit(user1, vault, utils.parseUnits(user1Deposit, underlyingDec));
          user1Deposited = true;
        }
      }

      if (i % 5 === 0) {
        if (user2Deposited) {
          const user2Staked = await Erc20Utils.balanceOf(vault.address, user2.address);
          await ZapUtils.zapLpOut(
              user2,
              multiSwap,
              zapContract,
              contractReader,
              vault.address,
              MaticAddresses.WMATIC_TOKEN,
              user2Staked.toString(),
              2
          );

          user2Deposited = false;
        } else {
          await ZapUtils.zapLpIn(
              user2,
              multiSwap,
              zapContract,
              contractReader,
              vault.address,
              MaticAddresses.WMATIC_TOKEN,
              1000,
              2
          );

          user2Deposited = true;
        }
      }

      // ! TIME MACHINE BRRRRRRR
      await TimeUtils.advanceBlocksOnTs(time);

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

      if (user1Deposited) {
        // test claim with exit
        await vault.connect(user1).exit();
        await VaultUtils.deposit(user1, vault, utils.parseUnits(user1Deposit, underlyingDec));
        const claimedUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals) - rtBalanceUser1;
        claimedTotal += claimedUser1;
        expect(claimedUser1).is.greaterThan(0);
        expect(toClaimUser1).is.approximately(claimedUser1, claimedUser1 * 0.01, 'user1 claimed not enough ' + i);
      }

      if (user2Deposited) {
        await vault.connect(user2).getAllRewards();
        const claimedUser2 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user2.address), rtDecimals) - rtBalanceUser2;
        claimedTotal += claimedUser2;
        expect(claimedUser2).is.greaterThan(0);
        expect(toClaimUser2).is.approximately(claimedUser2, claimedUser2 * 0.01, 'user2 claimed not enough ' + i);
      }

      if (i !== 0 && (i % +((cycles / 2).toFixed()) === 0)) {
        const rtBalanceUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals);
        await vault.connect(user3).getAllRewards();
        const claimedUser3 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user3.address), rtDecimals) - rtBalanceUser3;
        claimedTotal += claimedUser3;
        console.log('claimedUser3', claimedUser3);
        expect(claimedUser3).is.greaterThan(0);
        expect(toClaimUser3).is.approximately(claimedUser3, claimedUser3 * 0.01, 'user3 claimed not enough ' + i);
      }


      // ppfs change test
      await Erc20Utils.transfer(underlying, signer, vault.address, utils.parseUnits(undSendPart, underlyingDec).toString());
      const ppfsAfter = +utils.formatUnits(await vault.getPricePerFullShare(), underlyingDec);
      console.log('ppfs change', ppfsAfter - ppfs)
      console.log('claimedTotal', claimedTotal, +utils.formatUnits(rewardsTotalAmount, rtDecimals));

      if ((await multicall.getCurrentBlockTimestamp()).toNumber() > finish) {
        console.log('cycles ended', i);
        break;
      }

    }
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


  it("check reward with transfers", async () => {

    const underlying = await UniswapUtils.addLiquidity(signer, MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN,
        utils.parseUnits('100000').toString(), utils.parseUnits('100000', 6).toString(),
        MaticAddresses.SUSHI_FACTORY, MaticAddresses.SUSHI_ROUTER);

    const rt = MaticAddresses.SUSHI_TOKEN;

    // ******** DEPLOY VAULT *******
    const vault = await DeployerUtils.deploySmartVault(signer);
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN]) as NoopStrategy;
    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        60 * 60 * 24 * 28
    );
    await core.controller.addVaultAndStrategy(vault.address, strategy.address);
    await core.vaultController.addRewardTokens([vault.address], rt);

    // ********** INIT VARS **************
    const user1 = (await ethers.getSigners())[1];
    const rtDecimals = await Erc20Utils.decimals(rt);
    const underlyingDec = await Erc20Utils.decimals(underlying);
    const duration = (await vault.duration()).toNumber();
    const time = 60 * 60 * 6;
    const rewardsTotalAmount = utils.parseUnits('10000', rtDecimals);

    console.log('underlying amount', utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec));

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, rt, utils.parseUnits('300'), MaticAddresses.WETH_TOKEN);
    await Erc20Utils.approve(rt, signer, vault.address, rewardsTotalAmount.toString());
    await vault.notifyTargetRewardAmount(rt, rewardsTotalAmount);


    const signerUndBal = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), underlyingDec);
    const signerDeposit = (signerUndBal * 0.5).toFixed(underlyingDec);

    await VaultUtils.deposit(signer, vault, utils.parseUnits(signerDeposit, underlyingDec));
    console.log('signer deposited');

    const signerShareBal = await Erc20Utils.balanceOf(vault.address, signer.address);

    // clean address
    await Erc20Utils.transfer(rt, signer, core.feeRewardForwarder.address, (await Erc20Utils.balanceOf(rt, signer.address)).toString());

    //*************** CYCLES *************
    let claimedTotal = 0;
    const cycles = +(duration / (time + 3)).toFixed(0);
    console.log('cycles', cycles);
    for (let i = 0; i < cycles; i++) {
      console.log('cycle', i, cycles);
      await TimeUtils.advanceBlocksOnTs(time / 2);

      // send a part of share to user1
      await Erc20Utils.transfer(vault.address, signer, user1.address,
          signerShareBal.div((cycles * 2).toFixed(0)).toString());

      const vaultRtBalance = +utils.formatUnits(await Erc20Utils.balanceOf(rt, vault.address), rtDecimals);

      const rtBalanceSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals);
      const rtBalanceUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals);

      // signer claim
      const toClaimSigner = +utils.formatUnits(await vault.earnedWithBoost(rt, signer.address), rtDecimals);
      const toClaimSignerFullBoost = +utils.formatUnits(await vault.earned(rt, signer.address), rtDecimals);
      console.log('Signer toClaim', toClaimSigner, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalanceSigner, '100%', toClaimSignerFullBoost);
      expect(toClaimSigner).is.greaterThan(0, 'to claim signer is zero ' + i);
      await vault.getAllRewards();

      await TimeUtils.advanceBlocksOnTs(time / 2);

      // user1 claim
      const toClaimUser1 = +utils.formatUnits(await vault.earnedWithBoost(rt, user1.address), rtDecimals);
      const toClaimUser1FullBoost = +utils.formatUnits(await vault.earned(rt, user1.address), rtDecimals);
      console.log('User1 toClaim', toClaimUser1, 'all rewards in vault', vaultRtBalance, 'rt balance', rtBalanceUser1, '100%', toClaimUser1FullBoost);
      expect(toClaimUser1).is.greaterThan(0, 'to claim user1 is zero ' + i);
      await vault.connect(user1).getAllRewards();

      const claimedSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals) - rtBalanceSigner;
      console.log('claimedSigner', claimedSigner);
      claimedTotal += claimedSigner;

      const claimedUser1 = +utils.formatUnits(await Erc20Utils.balanceOf(rt, user1.address), rtDecimals) - rtBalanceUser1;
      console.log('claimedUser1', claimedUser1);
      claimedTotal += claimedUser1;


      expect(claimedSigner).is.greaterThan(0);
      expect(claimedUser1).is.greaterThan(0);
      expect(toClaimSigner).is.approximately(claimedSigner, claimedSigner * 0.01, 'signer claimed not enough ' + i);
      expect(toClaimUser1).is.approximately(claimedUser1, claimedUser1 * 0.01, 'user1 claimed not enough ' + i);
    }

    await TimeUtils.advanceBlocksOnTs(time * 2);

    const rtBalanceSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals);

    // signer claim
    const toClaimSigner = +utils.formatUnits(await vault.earnedWithBoost(rt, signer.address), rtDecimals);
    const toClaimSignerFullBoost = +utils.formatUnits(await vault.earned(rt, signer.address), rtDecimals);
    console.log('Signer toClaim', toClaimSigner, '100%', toClaimSignerFullBoost);
    expect(toClaimSigner).is.greaterThan(0, 'to claim signer is zero ');
    await vault.getAllRewards();


    const claimedSigner = +utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), rtDecimals) - rtBalanceSigner;
    console.log('claimedSigner', claimedSigner);
    claimedTotal += claimedSigner;

    const controllerBal = +utils.formatUnits(await Erc20Utils.balanceOf(rt, core.controller.address), rtDecimals);
    console.log('controller bal', controllerBal);
    console.log('claimedTotal', claimedTotal, +utils.formatUnits(rewardsTotalAmount, rtDecimals));
    expect(claimedTotal + controllerBal).is.approximately(+utils.formatUnits(rewardsTotalAmount, rtDecimals),
        +utils.formatUnits(rewardsTotalAmount, rtDecimals) * 0.01, 'total claimed not enough');

    await vault.exit();
  });


});
