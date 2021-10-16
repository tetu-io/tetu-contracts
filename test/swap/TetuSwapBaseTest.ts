import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {
  IStrategy,
  SmartVault,
  TetuSwapFactory,
  TetuSwapPair,
  TetuSwapRouter
} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ethers} from "hardhat";
import {TestAsserts} from "../TestAsserts";
import {StrategyTestUtils} from "../strategies/StrategyTestUtils";

const {expect} = chai;
chai.use(chaiAsPromised);


const IRON_FOLD_USDC = '0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7';
const IRON_FOLD_USDT = '0xE680e0317402ad3CB37D5ed9fc642702658Ef57F';

const tokenA = MaticAddresses.USDC_TOKEN;
const tokenB = MaticAddresses.USDT_TOKEN;

const TEST_AMOUNT = BigNumber.from(100);

describe("Tetu Swap base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let router: TetuSwapRouter;
  let ironFoldUsdcCtr: SmartVault;
  let ironFoldUsdtCtr: SmartVault;
  let tokenADec: number;
  let tokenBDec: number;
  let lp: string;
  let lpCtr: TetuSwapPair;
  let lpVault: SmartVault;
  let lpStrategy: IStrategy;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    factory = (await DeployerUtils.deploySwapFactory(signer, core.controller.address))[0] as TetuSwapFactory;
    router = await DeployerUtils.deployContract(signer, 'TetuSwapRouter', factory.address, MaticAddresses.WMATIC_TOKEN) as TetuSwapRouter;

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDT_TOKEN, utils.parseUnits('2000000'));

    ironFoldUsdcCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', IRON_FOLD_USDC) as SmartVault;
    ironFoldUsdtCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', IRON_FOLD_USDT) as SmartVault;

    // * setup LP

    tokenADec = await TokenUtils.decimals(tokenA);
    tokenBDec = await TokenUtils.decimals(tokenB);

    console.log('hash', await factory.calcHash());
    await factory.createPair(IRON_FOLD_USDC, IRON_FOLD_USDT);
    console.log('pair created')

    lp = await factory.getPair(tokenA, tokenB);
    expect(lp.toLowerCase()).is.not.eq(MaticAddresses.ZERO_ADDRESS);

    await core.controller.addToWhiteList(lp);

    lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;

    expect(await lpCtr.symbol()).is.eq('TLP_USDC_USDT');

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

    const data = await StrategyTestUtils.deploy(
        signer,
        core,
        'TETU_LP_VAULT',
        async vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyTetuSwap',
            core.controller.address,
            vaultAddress,
            lp
        ) as Promise<IStrategy>,
        lp
    );
    lpVault = data[0];
    lpStrategy = data[1];

    await factory.setPairRewardRecipient(lp, lpStrategy.address);

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

  it("add-trade-remove", async () => {
    await UniswapUtils.addLiquidity(
        signer,
        tokenA,
        tokenB,
        utils.parseUnits('100', tokenADec).toString(),
        utils.parseUnits('200', tokenBDec).toString(),
        factory.address,
        router.address
    );

    expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(199.999998);
    expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(399.999999);

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
    expect(userTokenBBalAfter - userTokenBBal).is.eq(19.029477000000043);

    expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(209.999998);
    expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.eq(380.970507);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.lessThan(0.0001);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.lessThan(0.0001);

    await UniswapUtils.removeLiquidity(
        signer,
        lp,
        tokenA,
        tokenB,
        (await TokenUtils.balanceOf(lp, signer.address)).toString(),
        router.address
    );

    expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);
    expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.eq(0);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.eq(0);

  });

  it("add-trade-remove loop", async () => {
    await TokenUtils.transfer(tokenA, signer, MaticAddresses.dQUICK_TOKEN,
        (await TokenUtils.balanceOf(tokenA, signer.address)).sub(utils.parseUnits('1100', tokenADec)).toString());
    await TokenUtils.transfer(tokenB, signer, MaticAddresses.dQUICK_TOKEN,
        (await TokenUtils.balanceOf(tokenB, signer.address)).sub(utils.parseUnits('2000', tokenBDec)).toString());
    let count = 0;
    while (count < 5) {
      count++;

      console.log('-------- LOOP START', count);
      const balA = +utils.formatUnits(await TokenUtils.balanceOf(tokenA, signer.address), tokenADec);
      const balB = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, signer.address), tokenBDec);
      console.log('bal A', balA);
      console.log('bal B', balB);
      expect(balA).is.greaterThan(1099.99)
      expect(balB).is.greaterThan(1999.99)

      await UniswapUtils.addLiquidity(
          signer,
          tokenA,
          tokenB,
          utils.parseUnits('100', tokenADec).toString(),
          utils.parseUnits('200', tokenBDec).toString(),
          factory.address,
          router.address
      );

      // expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.greaterThan(90);
      // expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.greaterThan(190);

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

      await factory.announceVaultsChange(IRON_FOLD_USDC, IRON_FOLD_USDT);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);
      await factory.setVaultsForPair(IRON_FOLD_USDC, IRON_FOLD_USDT);

      const userTokenABalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenA, signer.address), tokenADec);
      const userTokenBBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, signer.address), tokenBDec);

      console.log('bal A', userTokenABalAfter - userTokenABal);
      console.log('bal B', userTokenBBalAfter - userTokenBBal);

      expect(userTokenABalAfter - userTokenABal).is.eq(-10);
      // expect(userTokenBBalAfter - userTokenBBal).is.greaterThan(17);

      // expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.greaterThan(100);
      // expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.greaterThan(170);

      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.lessThan(0.0001);
      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.lessThan(0.0001);

      const txSwap1 = await UniswapUtils.swapExactTokensForTokens(
          signer,
          [tokenB, tokenA],
          utils.parseUnits((userTokenBBalAfter - userTokenBBal).toFixed(tokenBDec), tokenBDec).toString(),
          signer.address,
          router.address
      );

      const receiptSwap1 = await txSwap1.wait();
      console.log('receiptSwap1 gas', receiptSwap1.gasUsed.toString());

      await UniswapUtils.removeLiquidity(
          signer,
          lp,
          tokenA,
          tokenB,
          (await TokenUtils.balanceOf(lp, signer.address)).toString(),
          router.address
      );

      expect(+utils.formatUnits(await ironFoldUsdcCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);
      expect(+utils.formatUnits(await ironFoldUsdtCtr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);

      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.eq(0);
      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.eq(0);
    }
  });

  it('base parameters', async () => {
    const name = await lpCtr.name()
    expect(name).to.eq('TetuSwap LP')
    expect(await lpCtr.symbol()).to.eq('TLP_USDC_USDT')
    expect(await lpCtr.decimals()).to.eq(18)
    expect(await lpCtr.totalSupply()).to.eq(141313436)
    expect(await lpCtr.balanceOf(signer.address)).to.eq(141312436)
    expect(await lpCtr.DOMAIN_SEPARATOR()).to.eq(
        utils.keccak256(
            utils.defaultAbiCoder.encode(
                ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
                [
                  utils.keccak256(
                      utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
                  ),
                  utils.keccak256(utils.toUtf8Bytes(name)),
                  utils.keccak256(utils.toUtf8Bytes('1')),
                  137,
                  lp
                ]
            )
        )
    )
    expect(await lpCtr.PERMIT_TYPEHASH()).to.eq(
        utils.keccak256(utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  });

  it('approve', async () => {
    await TestAsserts.assertEvent(
        await lpCtr.approve(user.address, 1),
        'Approval',
        [signer.address, user.address, 1]
    );
    expect(await lpCtr.allowance(signer.address, user.address)).to.eq(1);
  });

  it('transfer', async () => {
    const balance = await lpCtr.balanceOf(signer.address);
    await TestAsserts.assertEvent(
        await lpCtr.transfer(user.address, TEST_AMOUNT),
        'Transfer',
        [signer.address, user.address, TEST_AMOUNT]
    );
    expect(await lpCtr.balanceOf(signer.address)).to.eq(balance.sub(TEST_AMOUNT))
    expect(await lpCtr.balanceOf(user.address)).to.eq(TEST_AMOUNT)
  });

  it('transfer:fail', async () => {
    await expect(lpCtr.transfer(user.address, (await lpCtr.totalSupply()).add(1))).to.be.revertedWith('0x11');
    await expect(lpCtr.connect(user).transfer(signer.address, 1)).to.be.revertedWith('0x11');
  });

  it('transferFrom', async () => {
    const balance = await lpCtr.balanceOf(signer.address);
    await lpCtr.approve(user.address, TEST_AMOUNT);

    await TestAsserts.assertEvent(
        await lpCtr.connect(user).transferFrom(signer.address, user.address, TEST_AMOUNT),
        'Transfer',
        [signer.address, user.address, TEST_AMOUNT]
    );
    expect(await lpCtr.allowance(signer.address, user.address)).to.eq(0)
    expect(await lpCtr.balanceOf(signer.address)).to.eq(balance.sub(TEST_AMOUNT))
    expect(await lpCtr.balanceOf(user.address)).to.eq(TEST_AMOUNT)
  });

  it('transferFrom:max', async () => {
    const balance = await lpCtr.balanceOf(signer.address);
    await lpCtr.approve(user.address, ethers.constants.MaxUint256)
    await TestAsserts.assertEvent(
        await lpCtr.connect(user).transferFrom(signer.address, user.address, TEST_AMOUNT),
        'Transfer',
        [signer.address, user.address, TEST_AMOUNT]
    );
    expect(await lpCtr.allowance(signer.address, user.address)).to.eq(ethers.constants.MaxUint256)
    expect(await lpCtr.balanceOf(signer.address)).to.eq(balance.sub(TEST_AMOUNT))
    expect(await lpCtr.balanceOf(user.address)).to.eq(TEST_AMOUNT)
  });

  it('set fee directly forbidden', async () => {
    await expect(lpCtr.setFee(0)).rejectedWith('TSP: Not factory')
  });

  it('set fee too high', async () => {
    await expect(factory.setPairFee(lp, 100)).rejectedWith('TSP: Too high fee')
  });

  it('set fee', async () => {
    await factory.setPairFee(lp, 0);
    expect(await lpCtr.fee()).is.eq(0);
  });

  it("claim", async () => {

    await UniswapUtils.addLiquidity(
        signer,
        tokenA,
        tokenB,
        utils.parseUnits('1000', tokenADec).toString(),
        utils.parseUnits('2000', tokenBDec).toString(),
        factory.address,
        router.address
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60);

    const rtBal = +utils.formatUnits(await TokenUtils.balanceOf(core.psVault.address, lpVault.address));
    await lpVault.doHardWork();
    const rtBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(core.psVault.address, lpVault.address));

    console.log('rtBal', rtBal);
    console.log('rtBalAfter', rtBalAfter);
    expect(rtBalAfter).is.greaterThan(rtBal);
  });

  it('price{0,1}CumulativeLast', async () => {
    const token0Amount = utils.parseUnits('100', tokenADec);
    const token1Amount = utils.parseUnits('200', tokenBDec);

    const blockTimestamp = (await lpCtr.getReserves())[2];
    await TimeUtils.advanceBlocksOnTs(1);
    await lpCtr.sync();
    const blockTimestamp2 = (await lpCtr.getReserves())[2];

    const initialPrice = UniswapUtils.encodePrice(token0Amount.sub(1), token1Amount.sub(1));
    const cumPrice0 = await lpCtr.price0CumulativeLast();
    const cumPrice1 = await lpCtr.price1CumulativeLast();

    const elapsedTime = blockTimestamp2 - blockTimestamp;
    console.log('time elapsed', elapsedTime);

    expect(cumPrice0).to.eq(initialPrice[0].mul(elapsedTime))
    expect(cumPrice1).to.eq(initialPrice[1].mul(elapsedTime))

    const swapAmount = utils.parseUnits('3', tokenADec);
    await TokenUtils.transfer(tokenA, signer, lp, swapAmount.toString());
    // swap to a new price eagerly instead of syncing
    await lpCtr.swap(0, utils.parseUnits('1', tokenBDec), signer.address, '0x')

    const blockTimestamp3 = (await lpCtr.getReserves())[2];
    const elapsedTime2 = blockTimestamp3 - blockTimestamp;

    expect(await lpCtr.price0CumulativeLast()).to.eq(initialPrice[0].mul(elapsedTime2));
    expect(await lpCtr.price1CumulativeLast()).to.eq(initialPrice[1].mul(elapsedTime2));
  })

});
