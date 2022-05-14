import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  BalLocker,
  ControllerMinimal,
  IBVault__factory,
  IERC20__factory,
  IFeeDistributor__factory,
  IGauge,
  IGauge__factory,
  IVotingEscrow__factory
} from "../../../../typechain";
import {EthAddresses} from "../../../../scripts/addresses/EthAddresses";
import {TimeUtils} from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {TokenUtils} from "../../../TokenUtils";
import {formatBytes32String, parseUnits} from "ethers/lib/utils";
import {ethers} from "hardhat";
import {defaultAbiCoder} from "@ethersproject/abi";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Bal locker tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let distributor: SignerWithAddress;
  let locker: BalLocker;
  let gauge: IGauge;

  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();

    if((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }
    [signer, distributor] = await ethers.getSigners();

    const controller = await DeployerUtils.deployContract(signer, 'ControllerMinimal', signer.address) as ControllerMinimal;

    locker = await DeployerUtils.deployContract(signer, 'BalLocker',
      controller.address,
      signer.address,
      EthAddresses.BALANCER_GAUGE_CONTROLLER,
      EthAddresses.BALANCER_FEE_DISTRIBUTOR,
    ) as BalLocker;

    gauge = IGauge__factory.connect(EthAddresses.BALANCER_GAUGE_USDC_WETH, signer);

    await TokenUtils.getToken(EthAddresses.BALANCER_BAL_WETH, signer.address, parseUnits('1000'));

    // *** WHITELIST ALL CONTRACTS FOR VE ***
    const checker = await DeployerUtils.deployContract(signer, 'SmartWalletCheckerStub');
    const veBalAdmin = await DeployerUtils.impersonate('0x8f42adbba1b16eaae3bb5754915e0d06059add75');
    await IVotingEscrow__factory.connect(EthAddresses.veBAL_TOKEN, veBalAdmin).commit_smart_wallet_checker(checker.address);
    await IVotingEscrow__factory.connect(EthAddresses.veBAL_TOKEN, veBalAdmin).apply_smart_wallet_checker();

    // *** ADD REWARDS TO GAUGE ***
    const authorizer = await DeployerUtils.impersonate('0x8F42aDBbA1B16EaAE3BB5754915E0D06059aDd75');
    await IGauge__factory.connect(EthAddresses.BALANCER_GAUGE_USDC_WETH, authorizer).add_reward(EthAddresses.USDC_TOKEN, distributor.address);
    expect((await gauge.reward_tokens(0)).toLowerCase()).eq(EthAddresses.USDC_TOKEN);
    await TokenUtils.getToken(EthAddresses.USDC_TOKEN, distributor.address, parseUnits('1000', 6));
    await TokenUtils.approve(EthAddresses.USDC_TOKEN, distributor, EthAddresses.BALANCER_GAUGE_USDC_WETH, parseUnits('1000', 6).toString());
    await IGauge__factory.connect(EthAddresses.BALANCER_GAUGE_USDC_WETH, distributor).deposit_reward_token(EthAddresses.USDC_TOKEN, parseUnits('1000', 6));
    const data = await gauge.reward_data(EthAddresses.USDC_TOKEN);
    expect(data.rate).not.eq(0);

    // *** DEPOSIT TO GAUGE ***
    await TokenUtils.getToken(EthAddresses.USDC_TOKEN, signer.address, parseUnits('1', 6));
    await TokenUtils.getToken(EthAddresses.WETH_TOKEN, signer.address, parseUnits('1'));
    await TokenUtils.approve(EthAddresses.USDC_TOKEN, signer, EthAddresses.BALANCER_VAULT, parseUnits('1', 6).toString());
    await TokenUtils.approve(EthAddresses.WETH_TOKEN, signer, EthAddresses.BALANCER_VAULT, parseUnits('1').toString());

    await IBVault__factory.connect(EthAddresses.BALANCER_VAULT, signer).joinPool(
      EthAddresses.BALANCER_USDC_WETH_ID,
      signer.address,
      signer.address,
      {
        assets: [EthAddresses.USDC_TOKEN, EthAddresses.WETH_TOKEN],
        maxAmountsIn: [parseUnits('10', 6), parseUnits('10')],
        userData: defaultAbiCoder.encode(['uint256', 'uint256[]', 'uint256'], [1, [parseUnits('1', 6), parseUnits('1')], 0]),
        fromInternalBalance: false
      }
    );

    const bal = await TokenUtils.balanceOf(EthAddresses.BALANCER_USDC_WETH, signer.address);
    await TokenUtils.approve(EthAddresses.BALANCER_USDC_WETH, signer, locker.address, bal.toString());
    await expect(locker.depositToGauge(EthAddresses.BALANCER_GAUGE_USDC_WETH, bal)).rejectedWith("Not allowed");
    await locker.linkDepositorsToGauges([signer.address], [EthAddresses.BALANCER_GAUGE_USDC_WETH]);
    await locker.depositToGauge(EthAddresses.BALANCER_GAUGE_USDC_WETH, bal.div(2));

    await TokenUtils.approve(EthAddresses.BALANCER_USDC_WETH, signer, gauge.address, bal.toString());
    await gauge["deposit(uint256)"](bal.div(2));
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });
  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("depositVe complex test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    // *** CLAIM GAUGE REWARDS without ve ***
    const s0 = await TimeUtils.snapshot();
    const usdcBefore0 = await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address);
    await gauge["claim_rewards(address)"](signer.address);
    const usdcAfter0 = (await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address)).sub(usdcBefore0);
    expect(usdcAfter0).not.eq(0);
    await TimeUtils.rollback(s0);

    // *** CLAIM GAUGE REWARDS without ve ***
    const s1 = await TimeUtils.snapshot();
    const balBefore1 = await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address);
    const usdcBefore1 = await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address);
    await locker.claimRewardsFromMinter(EthAddresses.BALANCER_GAUGE_USDC_WETH, signer.address);
    await locker.claimRewardsFromGauge(EthAddresses.BALANCER_GAUGE_USDC_WETH, signer.address);
    const balAfter1 = (await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address)).sub(balBefore1);
    const usdcAfter1 = (await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address)).sub(usdcBefore1);
    expect(balAfter1).not.eq(0);
    expect(usdcAfter1).not.eq(0);
    await TimeUtils.rollback(s1);

    // *** DEPOSIT VE ***
    const amount = parseUnits('1');
    await TokenUtils.transfer(EthAddresses.BALANCER_BAL_WETH, signer, locker.address, amount.toString());
    await locker.depositVe(amount);
    expect(await locker.investedUnderlyingBalance()).eq(amount);

    // *** CLAIM GAUGE REWARDS with ve ***
    const s2 = await TimeUtils.snapshot();
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    const balBefore2 = await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address);
    const usdcBefore2 = await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address);
    await locker.claimRewardsFromMinter(EthAddresses.BALANCER_GAUGE_USDC_WETH, signer.address);
    await locker.claimRewardsFromGauge(EthAddresses.BALANCER_GAUGE_USDC_WETH, signer.address);
    const balAfter2 = (await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address)).sub(balBefore2);
    const usdcAfter2 = (await TokenUtils.balanceOf(EthAddresses.USDC_TOKEN, signer.address)).sub(usdcBefore2);
    expect(balAfter2).above(balAfter1);
    expect(usdcAfter2).above(usdcAfter1);
    await TimeUtils.rollback(s2);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7);

    // *** ADD VE REWARDS ***
    const amountDistribute = parseUnits('100');
    await TokenUtils.getToken(EthAddresses.BAL_TOKEN, distributor.address, amountDistribute);
    await IERC20__factory.connect(EthAddresses.BAL_TOKEN, distributor).approve(EthAddresses.BALANCER_FEE_DISTRIBUTOR, amountDistribute);
    await IFeeDistributor__factory.connect(EthAddresses.BALANCER_FEE_DISTRIBUTOR, distributor).depositToken(EthAddresses.BAL_TOKEN, amountDistribute);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7);

    // *** CLAIM VE REWARDS ***
    expect(await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address)).eq(0);
    await locker.claimVeRewards([EthAddresses.BAL_TOKEN], signer.address);
    expect(await TokenUtils.balanceOf(EthAddresses.BAL_TOKEN, signer.address)).not.eq(0);
  });

  it("delegateVotes test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }
    await locker.delegateVotes(formatBytes32String("name.eth"), '0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446', signer.address)
  });

  it("clearDelegatedVotes test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }
    await locker.delegateVotes(formatBytes32String("name.eth"), '0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446', signer.address)
    await locker.clearDelegatedVotes(formatBytes32String("name.eth"), '0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446')
  });

  it("withdrawFromGauge test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }
    const bal = await TokenUtils.balanceOf(EthAddresses.BALANCER_USDC_WETH, signer.address);
    await locker.withdrawFromGauge(EthAddresses.BALANCER_GAUGE_USDC_WETH, parseUnits('0.1'))
    const balAfter = await TokenUtils.balanceOf(EthAddresses.BALANCER_USDC_WETH, signer.address);
    expect(balAfter.sub(bal)).eq(parseUnits('0.1'));
  });

  it("voteForManyGaugeWeights test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }
    // *** DEPOSIT VE ***
    const amount = parseUnits('1');
    await TokenUtils.transfer(EthAddresses.BALANCER_BAL_WETH, signer, locker.address, amount.toString());
    await locker.depositVe(amount);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);

    await locker.voteForManyGaugeWeights([EthAddresses.BALANCER_GAUGE_USDC_WETH], [100]);
  });

  it("setOperator test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await locker.setOperator(distributor.address);
    expect(await locker.operator()).eq(distributor.address);
  });

  it("setGaugeController test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await locker.setGaugeController(distributor.address);
    expect(await locker.gaugeController()).eq(distributor.address);
  });

  it("setFeeDistributor test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await locker.setFeeDistributor(distributor.address);
    expect(await locker.feeDistributor()).eq(distributor.address);
  });

  it("setVoter test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await locker.setVoter(distributor.address);
    expect(await locker.voter()).eq(distributor.address);
  });

  it("changeDepositorToGaugeLink test", async () => {
    if ((await ethers.provider.getNetwork()).chainId !== 1) {
      return;
    }

    await locker.changeDepositorToGaugeLink(EthAddresses.BALANCER_GAUGE_USDC_WETH, distributor.address);
    expect(await locker.gaugesToDepositors(EthAddresses.BALANCER_GAUGE_USDC_WETH)).eq(distributor.address);
  });

});
