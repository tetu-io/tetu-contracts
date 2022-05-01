import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Controller, ForwarderV2, IUniswapV2Factory} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {StrategyTestUtils} from "../../strategies/StrategyTestUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../../scripts/addresses/MaticAddresses";
import {FtmAddresses} from "../../../scripts/addresses/FtmAddresses";
import {EthAddresses} from "../../../scripts/addresses/EthAddresses";
import {balInfo} from "../../../scripts/deploy/base/info/ForwarderBalInfo";

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

  before(async function () {
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
    snapshotBefore = await TimeUtils.snapshot();
    forwarder = (await DeployerUtils.deployForwarderV2(signer, core.controller.address))[0];

    await core.announcer.announceAddressChange(2, forwarder.address);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.controller.setFeeRewardForwarder(forwarder.address);
    await core.controller.setRewardDistribution([forwarder.address], true);

    await core.announcer.announceRatioChange(9, 50, 100);
    await TimeUtils.advanceBlocksOnTs(1);
    await core.controller.setPSNumeratorDenominator(50, 100);

    usdc = await DeployerUtils.getUSDCAddress();
    await UniswapUtils.wrapNetworkToken(signer); // 10m wmatic
    const amountLp = '100000';
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits(amountLp, 6))
    const rewardTokenAddress = core.rewardToken.address;

    const usdcBal = await TokenUtils.balanceOf(usdc, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amountLp);

    await MintHelperUtils.mint(core.controller, core.announcer, amountLp, signer.address);

    const tokenBal = await TokenUtils.balanceOf(rewardTokenAddress, signer.address);
    console.log('Token minted', tokenBal.toString());
    expect(+utils.formatUnits(tokenBal, 18)).is.greaterThanOrEqual(+amountLp);

    factory = await DeployerUtils.getDefaultNetworkFactory();
    tetuLp = await UniswapUtils.addLiquidity(
      signer,
      rewardTokenAddress,
      usdc,
      utils.parseUnits(amountLp, 18).toString(),
      utils.parseUnits(amountLp, 6).toString(),
      factory,
      await DeployerUtils.getRouterByFactory(factory)
    );

    await forwarder.addLargestLps(
      [rewardTokenAddress],
      [tetuLp]
    );

    await forwarder.setUniPlatformFee(
      factory,
      9970,
      10000
    );

    await forwarder.setSlippageNumerator(50);

    await StrategyTestUtils.initForwarder(forwarder);
    await StrategyTestUtils.setConversionPaths(forwarder);
    await TokenUtils.getToken(usdc, signer.address, amount)
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
    await expect(forwarder.addLargestLps([Misc.ZERO_ADDRESS], [])).rejectedWith("F2: Wrong arrays");
  });

  it("should not setup wrong lps", async () => {
    await expect(forwarder.addLargestLps([Misc.ZERO_ADDRESS], [tetuLp])).rejectedWith("F2: Wrong LP");
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
    const _amount = utils.parseUnits('10', 6);
    const vault = core.psVault;
    await core.vaultController.addRewardTokens([vault.address], vault.address);
    await TokenUtils.getToken(usdc, signer.address, _amount);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(usdc, signer.address), 6)).is.greaterThanOrEqual(+utils.formatUnits(_amount, 6))
    await TokenUtils.approve(usdc, signer, forwarder.address, _amount.toString());
    await forwarder.distribute(_amount, usdc, vault.address);

    const qsFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', factory) as IUniswapV2Factory;

    const lpToken = await qsFactory.getPair(usdc, core.rewardToken.address);
    expect(lpToken.toLowerCase()).is.not.eq(Misc.ZERO_ADDRESS);

    const fundKeeperUSDCBal = +utils.formatUnits(await TokenUtils.balanceOf(usdc, core.fundKeeper.address), 6);
    const fundKeeperLPBal = +utils.formatUnits(await TokenUtils.balanceOf(lpToken, core.fundKeeper.address));
    const psVaultBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, core.psVault.address));
    const forwarderUsdcBal = +utils.formatUnits(await TokenUtils.balanceOf(usdc, forwarder.address), 6);
    const forwarderTetuBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, forwarder.address));

    console.log('fundKeeperUSDCBal', fundKeeperUSDCBal);
    console.log('fundKeeperLPBal', fundKeeperLPBal);
    console.log('psVaultBal', psVaultBal);

    expect(fundKeeperUSDCBal).is.greaterThanOrEqual(+utils.formatUnits(amount.div(10), 6));
    expect(fundKeeperLPBal).is.greaterThan(0);
    expect(psVaultBal).is.greaterThan(0);
    expect(forwarderUsdcBal).is.eq(0);
    expect(forwarderTetuBal).is.eq(2e-18);
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

    await forwarder.addLargestLps(
        [MaticAddresses.BAL_TOKEN],
        ['0xc67136e235785727a0d3B5Cfd08325327b81d373']
    );

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

    // init Bal Data
    await forwarder.setBalData(
        balInfo.balToken,
        balInfo.vault,
        balInfo.pool,
        balInfo.tokenOut
    );
    const balData = await forwarder.getBalData();
    expect(balData.balToken.toLowerCase()).eq(balInfo.balToken);
    expect(balData.vault.toLowerCase()).eq(balInfo.vault);
    expect(balData.pool.toLowerCase()).eq(balInfo.pool);
    expect(balData.tokenOut.toLowerCase()).eq(balInfo.tokenOut);

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

  it.skip("should liquidate sushi to fxs", async () => {
    await forwarder.addLargestLps(
      [MaticAddresses.FXS_TOKEN],
      ['0x4756FF6A714AB0a2c69a566E548B59c72eB26725']
    );
    const tokenIn = MaticAddresses.SUSHI_TOKEN;
    const dec = await TokenUtils.decimals(tokenIn);
    const _amount = utils.parseUnits('1', dec);
    await TokenUtils.getToken(tokenIn, signer.address, _amount);
    await TokenUtils.approve(tokenIn, signer, forwarder.address, _amount.toString());
    await forwarder.liquidate(tokenIn, MaticAddresses.FXS_TOKEN, _amount);
  });

  it.skip("should liquidate sushi to polyDoge", async () => {
    const tokenIn = MaticAddresses.SUSHI_TOKEN;
    const dec = await TokenUtils.decimals(tokenIn);
    const _amount = utils.parseUnits('1', dec);
    await TokenUtils.getToken(tokenIn, signer.address, _amount);
    await TokenUtils.approve(tokenIn, signer, forwarder.address, _amount.toString());
    await forwarder.liquidate(tokenIn, MaticAddresses.polyDoge_TOKEN, _amount);
  });

});
