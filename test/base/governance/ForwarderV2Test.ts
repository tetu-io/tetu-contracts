import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  Controller,
  ForwarderV2, IERC20__factory,
  IUniswapV2Factory,
  MockLiquidator,
  MockToken__factory, MockVeDist, NoopStrategy, SmartVault
} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../../scripts/addresses/MaticAddresses";
import {parseUnits} from "ethers/lib/utils";

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
  let usdc: string;
  let factory: string;
  let liquidator: MockLiquidator;
  let vault: SmartVault;
  let veDist: MockVeDist;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
    snapshotBefore = await TimeUtils.snapshot();
    forwarder = (await DeployerUtils.deployForwarderV2(signer, core.controller.address))[0];
    liquidator = await DeployerUtils.deployContract(signer, 'MockLiquidator') as MockLiquidator;
    console.log('liquidator.address', liquidator.address)
    await forwarder.setLiquidator(liquidator.address);

    await core.announcer.announceAddressChange(2, forwarder.address);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.controller.setFeeRewardForwarder(forwarder.address);
    await core.controller.setRewardDistribution([forwarder.address], true);

    await core.announcer.announceRatioChange(9, 50, 100);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.controller.setPSNumeratorDenominator(50, 100);

    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
    await MockToken__factory.connect(usdc, signer).mint(liquidator.address, parseUnits('1000000000', 6))
    const amountLp = '100000';
    const rewardTokenAddress = core.rewardToken.address;

    const usdcBal = await TokenUtils.balanceOf(usdc, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amountLp);

    await MintHelperUtils.mint(core.controller, core.announcer, '0', signer.address, true);
    await IERC20__factory.connect(rewardTokenAddress, signer).transfer(liquidator.address, parseUnits('1000000'))

    const tokenBal = await TokenUtils.balanceOf(rewardTokenAddress, signer.address);
    console.log('Token minted', tokenBal.toString());
    expect(+utils.formatUnits(tokenBal, 18)).is.greaterThanOrEqual(+amountLp);

    const uniData = await UniswapUtils.deployUniswap(signer);
    factory = uniData.factory.address;
    tetuLp = await UniswapUtils.addLiquidity(
      signer,
      rewardTokenAddress,
      usdc,
      utils.parseUnits(amountLp, 18).toString(),
      utils.parseUnits(amountLp, 6).toString(),
      factory,
      uniData.router.address
    );

    await forwarder.setSlippageNumerator(50);
    await forwarder.setLiquidityNumerator(30);
    await forwarder.setLiquidityRouter(uniData.router.address);

    if ((await core.controller.fundToken()) === Misc.ZERO_ADDRESS) {
      await core.controller.setFundToken(usdc);
    }

    // await StrategyTestUtils.initForwarder(forwarder);
    // await StrategyTestUtils.setConversionPaths(forwarder);
    // await TokenUtils.getToken(usdc, signer.address, amount)

    veDist = await DeployerUtils.deployContract(signer, 'MockVeDist') as MockVeDist;
    await forwarder.setVeDist(veDist.address);


    vault = await DeployerUtils.deploySmartVault(signer);

    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller.address, usdc, vault.address, [Misc.ZERO_ADDRESS], [usdc], 1) as NoopStrategy;

    await vault.initializeSmartVault(
      "NOOP",
      "tNOOP",
      core.controller.address,
      usdc,
      60*60*24,
      false,
      Misc.ZERO_ADDRESS,
      0
    );

    await core.controller.addVaultsAndStrategies([vault.address], [strategy.address]);
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

  it("should not distribute  with zero fund token", async () => {
    const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
    const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
    const controller = controllerLogic.attach(controllerProxy.address) as Controller;
    await controller.initialize();
    const feeRewardForwarder = (await DeployerUtils.deployForwarderV2(signer, controller.address))[0];
    await expect(feeRewardForwarder.distribute(1, Misc.ZERO_ADDRESS, Misc.ZERO_ADDRESS)).is.rejectedWith('F2: Fund token is zero')
  });

  it("should not distribute without liq path", async () => {
    await TokenUtils.approve(usdc, signer, forwarder.address, amount.toString());
    expect(forwarder.distribute(amount, usdc, core.psVault.address)).rejectedWith('psToken not added to vault');
  });

  it("should distribute", async () => {
    console.log('usdc', usdc)
    console.log('rewardToken', core.rewardToken.address)

    const _amount = utils.parseUnits('10', 6);
    await core.vaultController.addRewardTokens([vault.address], core.rewardToken.address);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(usdc, signer.address), 6)).is.greaterThanOrEqual(+utils.formatUnits(_amount, 6))
    await TokenUtils.approve(usdc, signer, forwarder.address, _amount.toString());
    await forwarder.distribute(_amount, usdc, vault.address);

    const qsFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', factory) as IUniswapV2Factory;

    const lpToken = await qsFactory.getPair(usdc, core.rewardToken.address);
    expect(lpToken.toLowerCase()).is.not.eq(Misc.ZERO_ADDRESS);

    const fundKeeperUSDCBal = +utils.formatUnits(await TokenUtils.balanceOf(usdc, core.fundKeeper.address), 6);
    const fundKeeperLPBal = +utils.formatUnits(await TokenUtils.balanceOf(lpToken, core.fundKeeper.address));
    const veDistBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, veDist.address));
    const forwarderUsdcBal = +utils.formatUnits(await TokenUtils.balanceOf(usdc, forwarder.address), 6);
    const forwarderTetuBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, forwarder.address));

    console.log('fundKeeperUSDCBal', fundKeeperUSDCBal);
    console.log('fundKeeperLPBal', fundKeeperLPBal);
    console.log('veDistBal', veDistBal);

    expect(fundKeeperUSDCBal).is.greaterThanOrEqual(+utils.formatUnits(amount.div(10), 6));
    expect(fundKeeperLPBal).is.greaterThan(0);
    expect(veDistBal).is.greaterThan(0);
    expect(forwarderUsdcBal).is.eq(0);
    expect(forwarderTetuBal).is.eq(0);
  });

  it("should liquidate usdc to tetu", async () => {
    const dec = await TokenUtils.decimals(usdc);
    const _amount = utils.parseUnits('1000', dec);
    await TokenUtils.getToken(usdc, signer.address, _amount);
    await TokenUtils.approve(usdc, signer, forwarder.address, _amount.toString());
    expect(+utils.formatUnits(await TokenUtils.balanceOf(usdc, signer.address), dec)).is.greaterThanOrEqual(+utils.formatUnits(_amount, dec))
    await forwarder.liquidate(usdc, core.rewardToken.address, _amount);
  });

  it("should liquidate bal to usdc & tetu", async () => {
    let bal: string;
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      bal = MaticAddresses.BAL_TOKEN;
    } else {
      // Do not test on other networks (Polygon only)
      return;
    }

    const dec = await TokenUtils.decimals(bal);
    const _amount = utils.parseUnits('1000', dec);
    const _amountToGet = _amount.mul(4);
    await TokenUtils.getToken(bal, signer.address, _amountToGet);
    await TokenUtils.approve(bal, signer, forwarder.address, _amountToGet.toString());
    expect(+utils.formatUnits(await TokenUtils.balanceOf(bal, signer.address), dec)).is.greaterThanOrEqual(+utils.formatUnits(_amountToGet, dec))

    console.log('1 ----- liq BAL to USDC using uniswap pool. amount', _amount.toString());
    const usdcBefore1 = await TokenUtils.balanceOf(usdc, signer.address)
    await forwarder.liquidate(bal, usdc, _amount);
    const usdcAfter1 = await TokenUtils.balanceOf(usdc, signer.address)
    const usdcOut1 = usdcAfter1.sub(usdcBefore1);
    console.log('usdcOut1', usdcOut1.toString());

    console.log('2 ----- liq BAL to TETU. using uniswap pool. amount', _amount.toString())
    const tetu = MaticAddresses.TETU_TOKEN; // test with real TETU, not core.rewardToken.address;
    const tetuBefore1 = await TokenUtils.balanceOf(tetu, signer.address)
    await forwarder.liquidate(bal, tetu, _amount);
    const tetuAfter1 = await TokenUtils.balanceOf(tetu, signer.address)
    const tetuOut1 = tetuAfter1.sub(tetuBefore1);
    console.log('tetuOut1', tetuOut1.toString());

    console.log('3 ----- liq BAL to USDC using Balancer. amount', _amount.toString());
    const usdcBefore2 = await TokenUtils.balanceOf(usdc, signer.address)
    await forwarder.liquidate(bal, usdc, _amount);
    const usdcAfter2 = await TokenUtils.balanceOf(usdc, signer.address)
    const usdcOut2 = usdcAfter2.sub(usdcBefore2);
    console.log('usdcOut2', usdcOut2.toString());
    const increasePercentsUsdc = usdcOut2.mul(100).div(usdcOut1);
    console.log('increasePercentsUsdc', increasePercentsUsdc.toString());
    expect(usdcOut2).gt(usdcOut1);

    console.log('4 ----- liq BAL to TETU. using Balancer. amount', _amount.toString())
    const tetuBefore2 = await TokenUtils.balanceOf(tetu, signer.address)
    await forwarder.liquidate(bal, tetu, _amount);
    const tetuAfter2 = await TokenUtils.balanceOf(tetu, signer.address)
    const tetuOut2 = tetuAfter2.sub(tetuBefore2);
    console.log('tetuOut2', tetuOut2.toString());
    const increasePercentsTetu = tetuOut2.mul(100).div(tetuOut1);
    console.log('increasePercentsTetu', increasePercentsTetu.toString());
    expect(tetuOut2).gt(tetuOut1);
  });

});
