import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  Controller,
  FeeRewardForwarder,
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

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Fee reward forwarder tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let forwarder: FeeRewardForwarder;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    forwarder = core.feeRewardForwarder;
    await UniswapUtils.wrapMatic(signer); // 10m wmatic
    await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('100000'));

    const amount = '10000';

    await UniswapUtils.swapNETWORK_COINForExactTokens(
      signer,
      [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN],
      utils.parseUnits(amount, 6).toString(),
      MaticAddresses.QUICK_ROUTER
    );
    const rewardTokenAddress = core.rewardToken.address;

    const usdcBal = await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address);
    console.log('USDC bought', usdcBal.toString());
    expect(+utils.formatUnits(usdcBal, 6)).is.greaterThanOrEqual(+amount);

    await MintHelperUtils.mint(core.controller, core.announcer, amount, signer.address);

    const tokenBal = await TokenUtils.balanceOf(rewardTokenAddress, signer.address);
    console.log('Token minted', tokenBal.toString());
    expect(+utils.formatUnits(tokenBal, 18)).is.greaterThanOrEqual(+amount);

    await UniswapUtils.addLiquidity(
      signer,
      rewardTokenAddress,
      MaticAddresses.USDC_TOKEN,
      utils.parseUnits(amount, 18).toString(),
      utils.parseUnits(amount, 6).toString(),
      MaticAddresses.QUICK_FACTORY,
      MaticAddresses.QUICK_ROUTER
    );

    await core.feeRewardForwarder.setLiquidityNumerator(50);
    await core.feeRewardForwarder.setLiquidityRouter(MaticAddresses.QUICK_ROUTER);
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

  it("should not setup empty conv path", async () => {
    await expect(forwarder.setConversionPath([], [])).rejectedWith('FRF: Wrong data');
  });

  it("should not setup wrong conv path", async () => {
    await expect(forwarder.setConversionPath([MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS],
      [MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS])).rejectedWith('FRF: Wrong data');
  });

  it("should not notify ps with zero target token", async () => {
    const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
    const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
    const controller = controllerLogic.attach(controllerProxy.address) as Controller;
    await controller.initialize();
    const feeRewardForwarder = (await DeployerUtils.deployFeeForwarder(signer, controller.address))[0];
    await expect(feeRewardForwarder.callStatic.notifyPsPool(MaticAddresses.ZERO_ADDRESS, 1)).is.rejectedWith('FRF: Target token is zero for notify')
  });

  it("should not notify ps without liq path", async () => {
    await expect(forwarder.notifyPsPool(MaticAddresses.ZERO_ADDRESS, '1')).rejectedWith('FRF: Liquidation path not found for target token');
  });

  it("should not notify vault without xTETU", async () => {
    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
      't',
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        'StrategyWaultSingle',
        core.controller.address,
        vaultAddress,
        MaticAddresses.WEXpoly_TOKEN,
        1
      ) as Promise<IStrategy>,
      core.controller,
      core.vaultController,
      MaticAddresses.WMATIC_TOKEN,
      signer
    );
    const vault = data[1] as SmartVault;
    expect(forwarder.notifyCustomPool(MaticAddresses.WMATIC_TOKEN, vault.address, '1')).rejectedWith('psToken not added to vault');
  });

  it("should not notify vault without liq path", async () => {
    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
      't',
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        'StrategyWaultSingle',
        core.controller.address,
        vaultAddress,
        MaticAddresses.WEXpoly_TOKEN,
        1
      ) as Promise<IStrategy>,
      core.controller,
      core.vaultController,
      MaticAddresses.WMATIC_TOKEN,
      signer
    );
    const vault = data[1] as SmartVault;
    await core.vaultController.addRewardTokens([vault.address], core.psVault.address);
    await expect(forwarder.notifyCustomPool(MaticAddresses.WMATIC_TOKEN, vault.address, '1')).rejectedWith('FRF: Liquidation path not found for target token');
  });

  it("should notify ps single liq path", async () => {
    await core.feeRewardForwarder.setConversionPath(
      [MaticAddresses.USDC_TOKEN, core.rewardToken.address],
      [MaticAddresses.QUICK_ROUTER]
    );
    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, utils.parseUnits('1000', 6).toString());
    expect(await forwarder.callStatic.notifyPsPool(MaticAddresses.USDC_TOKEN, utils.parseUnits('1000', 6))).is.not.eq(0);
  });

  it("should distribute", async () => {
    const psRatioNom = (await core.controller.psNumerator()).toNumber();
    const psRatioDen = (await core.controller.psDenominator()).toNumber();
    const psRatio = psRatioNom / psRatioDen;
    console.log('psRatio', psRatio);

    await core.feeRewardForwarder.setConversionPathMulti(
      [[MaticAddresses.USDC_TOKEN, core.rewardToken.address]],
      [[MaticAddresses.QUICK_ROUTER]]
    );

    const amount = utils.parseUnits('1000', 6);

    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, signer, forwarder.address, utils.parseUnits('1000', 6).toString());
    await forwarder.distribute(amount, MaticAddresses.USDC_TOKEN, core.psVault.address);

    const qsFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', MaticAddresses.QUICK_FACTORY) as IUniswapV2Factory;

    const lpToken = await qsFactory.getPair(MaticAddresses.USDC_TOKEN, core.rewardToken.address);
    expect(lpToken.toLowerCase()).is.not.eq(MaticAddresses.ZERO_ADDRESS);

    const fundKeeperUSDCBal = +utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, core.fundKeeper.address), 6);
    const fundKeeperLPBal = +utils.formatUnits(await TokenUtils.balanceOf(lpToken, core.fundKeeper.address));
    const psVaultBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, core.psVault.address));

    console.log('fundKeeperUSDCBal', fundKeeperUSDCBal);
    console.log('fundKeeperLPBal', fundKeeperLPBal);
    console.log('psVaultBal', psVaultBal);

    expect(fundKeeperUSDCBal).is.eq(100);
    expect(fundKeeperLPBal).is.greaterThan(0);
    expect(psVaultBal).is.greaterThan(0);

  });

});
