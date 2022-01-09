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
  TetuSwapPair__factory,
  TetuSwapRouter
} from "../../typechain";
import {UniswapUtils} from "../UniswapUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ethers, web3} from "hardhat";
import {TestAsserts} from "../TestAsserts";
import {VaultUtils} from "../VaultUtils";
import {StrategyTestUtils} from "../strategies/StrategyTestUtils";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

const TEST_AMOUNT = BigNumber.from(100);

describe("Tetu Swap base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let router: TetuSwapRouter;
  let vault0Ctr: SmartVault;
  let vault1Ctr: SmartVault;
  let tokenADec: number;
  let tokenBDec: number;
  let lp: string;
  let lpCtr: TetuSwapPair;
  let lpVault: SmartVault;
  let lpStrategy: IStrategy;
  let vaultUsdcCtr: SmartVault;
  let vaultUsdtCtr: SmartVault;
  let usdc: string;
  let networkToken: string;
  let tokenA: string;
  let tokenB: string;
  let vault0: string;
  let vault1: string;

  before(async function () {
    console.log(
      web3.utils.keccak256(
        web3.utils.encodePacked(
          ((await ethers.getContractFactory(
            'TetuSwapPair',
            signer
          )) as TetuSwapPair__factory).bytecode
        ) as string
      )
    );
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[0];
    // core = await DeployerUtils.getCoreAddressesWrapper(signer);
    core = await DeployerUtils.deployAllCoreContracts(signer);

    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));
    tokenA = usdc
    tokenB = networkToken


    vault0 = (await DeployerUtils.deployDefaultNoopStrategyAndVault(
      signer,
      core.controller,
      core.vaultController,
      usdc,
      core.psVault.address
    ))[1].address;

    vault1 = (await DeployerUtils.deployDefaultNoopStrategyAndVault(
      signer,
      core.controller,
      core.vaultController,
      networkToken,
      core.psVault.address
    ))[1].address;

    vaultUsdcCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault0) as SmartVault;
    vaultUsdtCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault1) as SmartVault;

    factory = (await DeployerUtils.deploySwapFactory(signer, core.controller.address))[0] as TetuSwapFactory;
    router = await DeployerUtils.deployContract(signer, 'TetuSwapRouter', factory.address, networkToken) as TetuSwapRouter;

    vault0Ctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault0) as SmartVault;
    vault1Ctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault1) as SmartVault;

    // * setup LP

    tokenADec = await TokenUtils.decimals(tokenA);
    tokenBDec = await TokenUtils.decimals(tokenB);

    await factory.createPair(vault0, vault1);
    console.log('pair created')

    lp = await factory.getPair(tokenA, tokenB);
    expect(lp.toLowerCase()).is.not.eq(Misc.ZERO_ADDRESS);

    await core.controller.setPureRewardConsumers([lp], true);
    expect(await core.controller.isPoorRewardConsumer(lp)).is.eq(true);

    lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;


    if ((await ethers.provider.getNetwork()).chainId === 250) {
      expect(await lpCtr.symbol()).is.eq('TLP_USDC_WFTM');
    } else if ((await ethers.provider.getNetwork()).chainId === 250) {
      expect(await lpCtr.symbol()).is.eq('TLP_WMATIC_USDC');
    }
    const lpV0 = (await lpCtr.vault0()).toLowerCase();
    const lpV1 = (await lpCtr.vault1()).toLowerCase();
    expect(lpV0 === vault0.toLowerCase() || lpV0 === vault1.toLowerCase()).is.eq(true);
    expect(lpV1 === vault0.toLowerCase() || lpV1 === vault1.toLowerCase()).is.eq(true);

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
      vaultAddress => DeployerUtils.deployContract(
        signer,
        'StrategyTetuSwapFantom',
        core.controller.address,
        vaultAddress,
        lp
      ) as Promise<IStrategy>,
      lp
    );
    lpVault = data[0];
    lpStrategy = data[1];

    await factory.setPairRewardRecipients([lp], [lpStrategy.address]);

    await StrategyTestUtils.initForwarder(core.feeRewardForwarder);

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

    expect(+utils.formatUnits(await vault0Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.approximately(200, 0.0001);
    expect(+utils.formatUnits(await vault1Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenBDec)).is.approximately(400, 0.0001);

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
    expect(userTokenBBalAfter - userTokenBBal).is.approximately(19.029477, 0.00001);

    expect(+utils.formatUnits(await vault0Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.approximately(210, 0.0001);
    expect(+utils.formatUnits(await vault1Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenBDec)).is.approximately(380.954186, 0.0001);

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

    expect(+utils.formatUnits(await vault0Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);
    expect(+utils.formatUnits(await vault1Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenBDec)).is.lessThan(0.01);

    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.eq(0);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.eq(0);

  });

  it("add-trade-remove loop", async () => {
    // transfer excess
    await TokenUtils.transfer(tokenA, signer, core.bookkeeper.address,
      (await TokenUtils.balanceOf(tokenA, signer.address)).sub(utils.parseUnits('1100', tokenADec)).toString());
    await TokenUtils.transfer(tokenB, signer, core.bookkeeper.address,
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

      await factory.announceVaultsChange(vault0, vault1);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);
      await factory.setVaultsForPair(vault0, vault1);

      const userTokenABalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenA, signer.address), tokenADec);
      const userTokenBBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, signer.address), tokenBDec);

      console.log('bal A', userTokenABalAfter - userTokenABal);
      console.log('bal B', userTokenBBalAfter - userTokenBBal);

      expect(userTokenABalAfter - userTokenABal).is.eq(-10);

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

      expect(+utils.formatUnits(await vault0Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenADec)).is.lessThan(0.01);
      expect(+utils.formatUnits(await vault1Ctr.underlyingBalanceWithInvestmentForHolder(lp), tokenBDec)).is.lessThan(0.01);

      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenA, lp), tokenADec)).is.eq(0);
      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenB, lp), tokenBDec)).is.eq(0);
    }
  });

  it('base parameters', async () => {
    const name = await lpCtr.name()
    expect(name).to.eq('TetuSwap LP')
    expect(await lpCtr.decimals()).to.eq(18)
    expect((await lpCtr.totalSupply()).toNumber()).to.approximately(141421356237309, 400000)
    expect((await lpCtr.balanceOf(signer.address)).toNumber()).to.approximately(141421356236309, 400000)
    const net = await ethers.provider.getNetwork();
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
            net.chainId,
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

  it('set fee negative cases', async () => {
    await expect(factory.setPairsFee([lp], 100)).rejectedWith("TSF: Too early")
    await factory.announcePairsFeeChange([lp]);
    await expect(factory.announcePairsFeeChange([lp])).rejectedWith("TSF: Time-lock already defined");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(factory.setPairsFee([lp], 100)).rejectedWith('TSP: Too high fee')
  });

  it('set fee', async () => {
    await factory.announcePairsFeeChange([lp]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await factory.setPairsFee([lp], 0);
    expect(await lpCtr.fee()).is.eq(0);
  });

  it("claim + hardwork", async () => {

    await UniswapUtils.addLiquidity(
      signer,
      tokenA,
      tokenB,
      utils.parseUnits('1000', tokenADec).toString(),
      utils.parseUnits('2000', tokenBDec).toString(),
      factory.address,
      router.address
    );

    const strategyBal = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, lpStrategy.address));

    await UniswapUtils.swapExactTokensForTokens(
      signer,
      [tokenA, tokenB],
      utils.parseUnits("100", tokenADec).toString(),
      signer.address,
      router.address
    );

    const strategyBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenB, lpStrategy.address));
    expect(strategyBalAfter).is.greaterThan(strategyBal);

    await TimeUtils.advanceBlocksOnTs(60 * 60);

    const rt = core.psVault.address;
    const toClaim = +utils.formatUnits((await vaultUsdcCtr.earned(rt, lp)).add(await vaultUsdtCtr.earned(rt, lp)));

    const rtBal = +utils.formatUnits(await TokenUtils.balanceOf(rt, lpVault.address));
    await lpVault.doHardWork();
    const rtBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(rt, lpVault.address));

    // todo fix
    // expect(rtBalAfter).is.greaterThan(rtBal);
    // expect(rtBalAfter).is.approximately(toClaim, toClaim * 0.001);
  });

  // todo fix
  it.skip('price{0,1}CumulativeLast', async () => {
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
  });

  it('fail on zero output amount', async () => {
    await expect(lpCtr.swap(
      0,
      0,
      signer.address,
      '0x'
    )).rejectedWith('TSP: Insufficient output amount');
  });

  it('fail on zero input amount', async () => {
    await expect(lpCtr.swap(
      0,
      100,
      signer.address,
      '0x'
    )).rejectedWith('TSP: Insufficient input amount');
  });

  it('healthy K', async () => {
    const amountOut = 10000;
    const reserves = await lpCtr.getReserves();
    const inputIn = await lpCtr.getAmountIn(amountOut, reserves[0], reserves[1]);
    console.log('inputIn', inputIn.toString());
    await TokenUtils.transfer(tokenA, signer, lp, inputIn.sub(1).toString());
    await expect(lpCtr.swap(
      0,
      amountOut,
      signer.address,
      '0x'
    )).rejectedWith('TSP: Insufficient input amount');

  });

  it('healthy K after vault manipulations', async () => {
    await factory.setPairRewardRecipients([lp], [core.controller.address]);

    await VaultUtils.deposit(signer, vaultUsdcCtr, utils.parseUnits('800', tokenADec));

    await TimeUtils.advanceNBlocks(5);

    await vaultUsdcCtr.doHardWork();

    const amountOut = 10000;
    const reserves = await lpCtr.getReserves();
    const inputIn = await lpCtr.getAmountIn(amountOut, reserves[0], reserves[1]);
    console.log('inputIn', inputIn.toString());
    await TokenUtils.transfer(tokenA, signer, lp, inputIn.toString());
    await lpCtr.sync();
    await lpCtr.swap(
      0,
      amountOut,
      signer.address,
      '0x'
    );

  });

  // it('swap btc-eth', async () => {
  //
  //   await factory.createPair('0xd051605e07c2b526ed9406a555601aa4db8490d9', '0x6781e4a6e6082186633130f08246a7af3a7b8b40');
  //   const lp1 = await factory.getPair(MaticAddresses.WBTC_TOKEN, MaticAddresses.WETH_TOKEN);
  //   await factory.setPairRewardRecipients([lp1], [core.controller.address]);
  //   await core.controller.setPureRewardConsumers([lp1], true);
  //
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WETH_TOKEN, utils.parseUnits('100000'));
  //
  //   await UniswapUtils.addLiquidity(
  //     signer,
  //     MaticAddresses.WBTC_TOKEN,
  //     MaticAddresses.WETH_TOKEN,
  //     utils.parseUnits('0.01', 8).toString(),
  //     utils.parseUnits('0.1').toString(),
  //     factory.address,
  //     router.address
  //   );
  //
  //   await UniswapUtils.swapExactTokensForTokens(
  //     signer,
  //     [MaticAddresses.WBTC_TOKEN, MaticAddresses.WETH_TOKEN],
  //     utils.parseUnits("0.0001", 8).toString(),
  //     signer.address,
  //     router.address
  //   );
  // });

});
