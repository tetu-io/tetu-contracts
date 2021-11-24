import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  Controller,
  ForwarderV2,
  IStrategy,
  IUniswapV2Factory,
  SmartVault
} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {StrategyTestUtils} from "../../strategies/StrategyTestUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("ForwarderV2 tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let forwarder: ForwarderV2;
  let tetuLp: string;
  const amount = utils.parseUnits('10', 6);

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
    forwarder = (await DeployerUtils.deployForwarderV2(signer, core.controller.address))[0];

    await core.announcer.announceAddressChange(2, forwarder.address);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.controller.setFeeRewardForwarder(forwarder.address);
    await core.controller.setRewardDistribution([forwarder.address], true);

    await UniswapUtils.wrapMatic(signer); // 10m wmatic
    await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('100000'));

    const amountLp = '10000000';
    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, signer.address, utils.parseUnits(amountLp, 6))
    const rewardTokenAddress = core.rewardToken.address;

    const usdcBal = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amountLp);

    await MintHelperUtils.mint(core.controller, core.announcer, amountLp, signer.address);

    const tokenBal = await TokenUtils.balanceOf(rewardTokenAddress, signer.address);
    console.log('Token minted', tokenBal.toString());
    expect(+utils.formatUnits(tokenBal, 18)).is.greaterThanOrEqual(+amountLp);

    tetuLp = await UniswapUtils.addLiquidity(
      signer,
      rewardTokenAddress,
      MaticAddresses.USDC_TOKEN,
      utils.parseUnits(amountLp, 18).toString(),
      utils.parseUnits(amountLp, 6).toString(),
      MaticAddresses.QUICK_FACTORY,
      MaticAddresses.QUICK_ROUTER
    );

    await StrategyTestUtils.initForwarder(forwarder);
    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, signer.address, amount)
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

  it("should not setup wrong lps arrays", async () => {
    await expect(forwarder.addLargestLps([MaticAddresses.QUICK_FACTORY], [])).rejectedWith("F2: Wrong arrays");
  });

  it("should not setup wrong lps", async () => {
    await expect(forwarder.addLargestLps([MaticAddresses.USDC_TOKEN], [MaticAddresses.QUICK_WMATIC_ETH])).rejectedWith("F2: Wrong LP");
  });

  it("should not distribute  with zero fund token", async () => {
    const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
    const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
    const controller = controllerLogic.attach(controllerProxy.address) as Controller;
    await controller.initialize();
    const feeRewardForwarder = (await DeployerUtils.deployForwarderV2(signer, controller.address))[0];
    await expect(feeRewardForwarder.distribute(1, MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS)).is.rejectedWith('F2: Fund token is zero')
  });

  it("should not distribute without liq path", async () => {
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, amount.toString());
    expect(forwarder.distribute(amount, MaticAddresses.USDC_TOKEN, core.psVault.address)).rejectedWith('psToken not added to vault');
  });

  it("should notify ps single liq path", async () => {
    await forwarder.addLargestLps(
      [core.rewardToken.address],
      [tetuLp]
    );
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, amount.toString());
    expect(await forwarder.callStatic.distribute(amount, MaticAddresses.USDC_TOKEN, core.psVault.address)).is.not.eq(0);
  });

  it("should distribute", async () => {
    const psRatioNom = (await core.controller.psNumerator()).toNumber();
    const psRatioDen = (await core.controller.psDenominator()).toNumber();
    const psRatio = psRatioNom / psRatioDen;
    console.log('psRatio', psRatio);

    await forwarder.addLargestLps(
      [core.rewardToken.address],
      [tetuLp]
    );
    expect(+utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address), 6)).is.greaterThanOrEqual(+utils.formatUnits(amount))
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, amount.toString());
    await forwarder.distribute(amount, MaticAddresses.USDC_TOKEN, core.psVault.address);

    const qsFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', MaticAddresses.QUICK_FACTORY) as IUniswapV2Factory;

    const lpToken = await qsFactory.getPair(MaticAddresses.USDC_TOKEN, core.rewardToken.address);
    expect(lpToken.toLowerCase()).is.not.eq(MaticAddresses.ZERO_ADDRESS);

    const fundKeeperUSDCBal = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, core.fundKeeper.address), 6);
    const fundKeeperLPBal = +utils.formatUnits(await TokenUtils.balanceOf(lpToken, core.fundKeeper.address));
    const psVaultBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, core.psVault.address));
    const forwarderUsdcBal = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, forwarder.address), 6);
    const forwarderTetuBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, forwarder.address));

    console.log('fundKeeperUSDCBal', fundKeeperUSDCBal);
    console.log('fundKeeperLPBal', fundKeeperLPBal);
    console.log('psVaultBal', psVaultBal);

    expect(fundKeeperUSDCBal).is.greaterThanOrEqual(+utils.formatUnits(amount.div(10), 6));
    expect(fundKeeperLPBal).is.greaterThan(0);
    expect(psVaultBal).is.greaterThan(0);
    expect(forwarderUsdcBal).is.eq(0);
    expect(forwarderTetuBal).is.eq(0);
  });

  it("should liquidate usdc to weth", async () => {
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, utils.parseUnits('1000', 6).toString());
    await forwarder.liquidate(MaticAddresses.USDC_TOKEN, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('1000', 6));
  });

  it("should liquidate fxs to tetu", async () => {
    await forwarder.addLargestLps(
      [MaticAddresses.FXS_TOKEN],
      [MaticAddresses.QUICK_FRAX_FXS]
    );
    await TokenUtils.getToken(MaticAddresses.FXS_TOKEN, signer.address);
    await TokenUtils.approve(MaticAddresses.FXS_TOKEN, signer, forwarder.address, utils.parseUnits('1000').toString());
    await forwarder.liquidate(MaticAddresses.FXS_TOKEN, MaticAddresses.CRV_TOKEN, utils.parseUnits('1000'));
  });

});
