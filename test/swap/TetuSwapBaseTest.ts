import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {SmartVault, TetuSwapFactory, TetuSwapPair, TetuSwapRouter} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";

const {expect} = chai;
chai.use(chaiAsPromised);

const IRON_FOLD_USDC = '0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7';
const IRON_FOLD_USDT = '0xE680e0317402ad3CB37D5ed9fc642702658Ef57F';

describe("Tetu pawnshop base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let router: TetuSwapRouter;
  let ironFoldUsdcCtr: SmartVault;
  let ironFoldUsdtCtr: SmartVault;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    factory = await DeployerUtils.deployContract(signer, 'TetuSwapFactory', signer.address) as TetuSwapFactory;
    router = await DeployerUtils.deployContract(signer, 'TetuSwapRouter', factory.address, MaticAddresses.WMATIC_TOKEN) as TetuSwapRouter;

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDT_TOKEN, utils.parseUnits('2000000'));

    ironFoldUsdcCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', IRON_FOLD_USDC) as SmartVault;
    ironFoldUsdtCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', IRON_FOLD_USDT) as SmartVault;


    // await StrategyTestUtils.setupForwarder(
    //     core.feeRewardForwarder,
    //     [MaticAddresses.ICE_TOKEN],
    //     MaticAddresses.USDT_TOKEN,
    //     core.rewardToken.address,
    //     MaticAddresses.DFYN_FACTORY
    // );
    //
    // await StrategyTestUtils.setupForwarder(
    //     core.feeRewardForwarder,
    //     [MaticAddresses.ICE_TOKEN],
    //     MaticAddresses.USDC_TOKEN,
    //     core.rewardToken.address,
    //     MaticAddresses.DFYN_FACTORY
    // );
    //
    //
    // const vaultDataUSDC = await StrategyTestUtils.deploy(
    //     signer,
    //     core,
    //     'IRON_FOLD_USDC',
    //     async vaultAddress => DeployerUtils.deployContract(
    //         signer,
    //         'StrategyIronFold',
    //         core.controller.address,
    //         vaultAddress,
    //         MaticAddresses.USDC_TOKEN,
    //         '0xbEbAD52f3A50806b25911051BabDe6615C8e21ef',
    //         6750,
    //         7499
    //     ) as Promise<StrategyIronFold>,
    //     MaticAddresses.USDC_TOKEN
    // );
    //
    // const vaultDataUSDT = await StrategyTestUtils.deploy(
    //     signer,
    //     core,
    //     'IRON_FOLD_USDT',
    //     async vaultAddress => DeployerUtils.deployContract(
    //         signer,
    //         'StrategyIronFold',
    //         core.controller.address,
    //         vaultAddress,
    //         MaticAddresses.USDT_TOKEN,
    //         '0xad6AD29d6b8B74b4302dD829c945ca3274035c16',
    //         6750,
    //         7499
    //     ) as Promise<StrategyIronFold>,
    //     MaticAddresses.USDT_TOKEN
    // );
    //
    // vaultUSDC = vaultDataUSDC[0];
    // vaultUSDT = vaultDataUSDT[0];
    //
    //
    // await VaultUtils.addRewardsXTetu(signer, vaultUSDC, core, 1);
    // await VaultUtils.addRewardsXTetu(signer, vaultUSDT, core, 1);
    //
    // await core.vaultController.changePpfsDecreasePermissions([vaultUSDC.address, vaultUSDT.address], true);

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

  it("create pair USDC-WMATIC", async () => {
    const tokenA = MaticAddresses.USDC_TOKEN;
    const tokenB = MaticAddresses.USDT_TOKEN;

    const tokenADec = await TokenUtils.decimals(tokenA);
    const tokenBDec = await TokenUtils.decimals(tokenB);

    console.log('hash', await factory.calcHash());
    await factory.createPair(tokenA, tokenB);
    console.log('pair created')

    const lp = await factory.getPair(tokenA, tokenB);
    expect(lp.toLowerCase()).is.not.eq(MaticAddresses.ZERO_ADDRESS);

    await core.controller.addToWhiteList(lp);

    const lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;

    expect(await lpCtr.symbol()).is.eq('TLP_USDC_USDT');

    await factory.setVaultsForPair(IRON_FOLD_USDC, IRON_FOLD_USDT);

    expect((await lpCtr.vault0()).toLowerCase()).is.eq(IRON_FOLD_USDC.toLowerCase());
    expect((await lpCtr.vault1()).toLowerCase()).is.eq(IRON_FOLD_USDT.toLowerCase());

    await UniswapUtils.addLiquidity(
        signer,
        tokenA,
        tokenB,
        utils.parseUnits('100', tokenADec).toString(),
        utils.parseUnits('200', tokenBDec).toString(),
        factory.address,
        router.address
    );

    expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(99.999999);
    expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(199.999999);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.eq(0);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.eq(0);

    const userTokenABal = +utils.formatUnits(await TokenUtils.balanceOf(tokenA, signer.address), tokenADec);
    const userTokenBBal = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, signer.address), tokenBDec);

    await UniswapUtils.swapExactTokensForTokens(
        signer,
        [tokenA, tokenB],
        utils.parseUnits("10", tokenADec).toString(),
        signer.address,
        router.address
    );

    const userTokenABalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenA, signer.address), tokenADec);
    const userTokenBBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, signer.address), tokenBDec);

    console.log('bal A', userTokenABalAfter - userTokenABal);
    console.log('bal B', userTokenBBalAfter - userTokenBBal);

    expect(userTokenABalAfter - userTokenABal).is.eq(-10);
    expect(userTokenBBalAfter - userTokenBBal).is.eq(18.17851200000041);

    expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(109.999999);
    expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(181.821474);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.lessThan(0.0001);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.lessThan(0.0001);

  });

});
