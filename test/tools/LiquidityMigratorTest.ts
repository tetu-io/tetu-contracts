import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {
  AutoRewarder, AutoRewarder__factory,
  ContractUtils,
  IBVault__factory,
  IERC20__factory, ISmartVault, ISmartVault__factory,
  ITetuSwapPair__factory,
  LiquidityMigrator
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, Signer, utils} from "ethers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {UniswapUtils} from "../UniswapUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe.skip("LiquidityMigratorTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  const rewarder = '0x5Cc44D1787aFB510F563Fe55Fd082D3d4d720671'
  const POOL_ID = '0xe2f706ef1f7240b803aae877c9c762644bb808d80002000000000000000008c2'
  const POOL_ADR = '0xE2f706EF1f7240b803AAe877C9C762644bb808d8'

  let migrator: LiquidityMigrator;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    migrator = await DeployerUtils.deployContract(signer, 'LiquidityMigrator') as LiquidityMigrator;
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

  it("withdraw test", async () => {
    const bal = await IERC20__factory.connect(MaticAddresses.USDC_TOKEN, signer).balanceOf(signer.address)
    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, migrator.address, parseUnits('5000000', 6));
    await migrator.withdraw(MaticAddresses.USDC_TOKEN, signer.address)
    const bal2 = await IERC20__factory.connect(MaticAddresses.USDC_TOKEN, signer).balanceOf(signer.address)
    expect(bal.add(bal2)).eq(parseUnits('5000000', 6))
  });

  it("buy tetu on uni", async () => {
    const UNI2_POOL = '0x80fF4e4153883d770204607eb4aF9994739C72DC';
    const calc = (await DeployerUtils.getToolsAddressesWrapper(signer)).calculator;

    await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, signer.address, parseUnits('5000000', 6));
    await IERC20__factory.connect(MaticAddresses.USDC_TOKEN, signer).approve(MaticAddresses.TETU_SWAP_ROUTER, Misc.MAX_UINT)

    for (let i = 0; i < 100; i++) {
      const price = formatUnits(await calc.getPriceWithDefaultOutput(MaticAddresses.TETU_TOKEN))
      const reserves = await ITetuSwapPair__factory.connect(UNI2_POOL, signer).getReserves()
      const usdcReserve = formatUnits(reserves[1], 6)
      const tetuReserve = formatUnits(reserves[0])
      console.log(tetuReserve, usdcReserve, price);
      await UniswapUtils.swapExactTokensForTokens(
        signer,
        [MaticAddresses.USDC_TOKEN, MaticAddresses.TETU_TOKEN],
        parseUnits('10000', 6).toString(),
        signer.address,
        MaticAddresses.TETU_SWAP_ROUTER
      );
    }
  });

  it("sell tetu on uni", async () => {
    const UNI2_POOL = '0x80fF4e4153883d770204607eb4aF9994739C72DC';
    const calc = (await DeployerUtils.getToolsAddressesWrapper(signer)).calculator;

    await TokenUtils.getToken(MaticAddresses.TETU_TOKEN, signer.address, parseUnits('80000000'));
    await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, signer).approve(MaticAddresses.TETU_SWAP_ROUTER, Misc.MAX_UINT)

    await ISmartVault__factory.connect('0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7', await DeployerUtils.impersonate()).withdrawAllToVault()

    for (let i = 0; i < 100; i++) {
      const price = formatUnits(await calc.getPriceWithDefaultOutput(MaticAddresses.TETU_TOKEN))
      const reserves = await ITetuSwapPair__factory.connect(UNI2_POOL, signer).getReserves()
      const usdcReserve = formatUnits(reserves[1], 6)
      const tetuReserve = formatUnits(reserves[0])
      console.log(tetuReserve, usdcReserve, price);
      await UniswapUtils.swapExactTokensForTokens(
        signer,
        [MaticAddresses.TETU_TOKEN, MaticAddresses.USDC_TOKEN],
        parseUnits('500000').toString(),
        signer.address,
        MaticAddresses.TETU_SWAP_ROUTER
      );
    }
  });


  it("migrate with extra tetu", async () => {
    await poolPrice(signer, POOL_ID)
    const uni2Pool = await migrator.UNI2_POOL();
    const pool = await migrator.BALANCER_POOL_ADDRESS();

    const univ2Bal = await IERC20__factory.connect(uni2Pool, signer).balanceOf(core.fundKeeper.address)
    await IERC20__factory.connect(uni2Pool, await DeployerUtils.impersonate(core.fundKeeper.address)).transfer(migrator.address, univ2Bal);

    await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, await DeployerUtils.impersonate(rewarder)).transfer(migrator.address, parseUnits('17000000'));

    await migrator.migrate(1, true);
    const univ2BalM = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(univ2BalM)).approximately(+formatUnits(univ2Bal) * 0.99, 0)
    const poolBalM = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(poolBalM)).approximately(135404, 10_000)

    await migrator.migrate(100, true);
    const univ2BalM2 = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    expect(univ2BalM2.isZero()).eq(true);
    const poolBalM2 = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(poolBalM2)).approximately(13655492, 1000_000)
    await poolPrice(signer, POOL_ID)

    // await buyTetuInLoop(signer, POOL_ID);
    await sellTetuInLoop(signer, POOL_ID);
  });


  it.skip("migrate with buyback", async () => {
    await poolPrice(signer, POOL_ID)
    const uni2Pool = await migrator.UNI2_POOL();
    const pool = await migrator.BALANCER_POOL_ADDRESS();

    const univ2Bal = await IERC20__factory.connect(uni2Pool, signer).balanceOf(core.fundKeeper.address)
    await IERC20__factory.connect(uni2Pool, await DeployerUtils.impersonate(core.fundKeeper.address)).transfer(migrator.address, univ2Bal);

    await migrator.migrate(1, false);
    const univ2BalM = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(univ2BalM)).approximately(+formatUnits(univ2Bal) * 0.99, 0)
    const poolBalM = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(poolBalM)).approximately(34_561, 1000)

    await migrator.migrate(100, false);
    const univ2BalM2 = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    expect(univ2BalM2.isZero()).eq(true);
    const poolBalM2 = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(poolBalM2)).approximately(3_456_269, 100_000)
    await poolPrice(signer, POOL_ID)

    // console.log('START BUYBACKS')
    //
    // for (let i = 0; i < 100; i++) {
    //   await migrator.buyBack(10);
    //   const usdcBal = formatUnits(await IERC20__factory.connect(MaticAddresses.USDC_TOKEN, signer).balanceOf(migrator.address), 6);
    //   const tetuBal = formatUnits(await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, signer).balanceOf(migrator.address))
    //   console.log('USDC bal', usdcBal)
    //   console.log('TETU bal', tetuBal)
    //   await poolPrice(signer, POOL_ID)
    //   if (+usdcBal < 1000) {
    //     break;
    //   }
    // }
    //
    // console.log('DUMP!')
    //
    // await TokenUtils.getToken(MaticAddresses.TETU_TOKEN, signer.address, parseUnits('50000000'));
    // await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, signer).approve(MaticAddresses.BALANCER_VAULT, Misc.MAX_UINT)
    //
    // for (let i = 0; i < 40; i++) {
    //   await sellTetu(signer, POOL_ID, parseUnits('1000000'));
    //   await poolPrice(signer, POOL_ID)
    // }

    // await buyTetuInLoop(signer, POOL_ID);
    await sellTetuInLoop(signer, POOL_ID);
  });

  it("MIGRATE", async () => {
    await ISmartVault__factory.connect('0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7', await DeployerUtils.impersonate()).withdrawAllToVault()

    await poolPrice(signer, POOL_ID)
    const uni2Pool = await migrator.UNI2_POOL();
    const pool = await migrator.BALANCER_POOL_ADDRESS();

    const univ2Bal = await IERC20__factory.connect(uni2Pool, signer).balanceOf(core.fundKeeper.address)
    console.log('univ2Bal', univ2Bal.toString());

    await core.announcer.announceTokenMove(13, core.fundKeeper.address, uni2Pool, univ2Bal);
    await core.announcer.announceTokenMove(11, migrator.address, uni2Pool, univ2Bal);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await core.controller.fundKeeperTokenMove(core.fundKeeper.address, uni2Pool, univ2Bal);
    await core.controller.controllerTokenMove(migrator.address, uni2Pool, univ2Bal);

    await AutoRewarder__factory.connect(rewarder, signer).withdraw(MaticAddresses.TETU_TOKEN, parseUnits('17000000'));
    await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, signer).transfer(migrator.address, parseUnits('17000000'));

    // await migrator.migrate(1, true);
    // const univ2BalM = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    // expect(+formatUnits(univ2BalM)).approximately(+formatUnits(univ2Bal) * 0.99, 0)
    // const poolBalM = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    // expect(+formatUnits(poolBalM)).approximately(135404, 10_000)

    console.log('MIGRATE!');

    await migrator.migrate(100, true);

    const univ2BalM2 = await IERC20__factory.connect(uni2Pool, signer).balanceOf(migrator.address)
    expect(univ2BalM2.isZero()).eq(true);
    const poolBalM2 = await IERC20__factory.connect(pool, signer).balanceOf(migrator.address)
    expect(+formatUnits(poolBalM2)).approximately(13655492, 1000_000)
    await poolPrice(signer, POOL_ID)
  });
});


async function poolPrice(signer: Signer, pool: string) {
  const v = IBVault__factory.connect(MaticAddresses.BALANCER_VAULT, signer);
  const poolInfo = await v.getPoolTokens(pool);
  const tetuReserv = +formatUnits(poolInfo.balances[0],)
  const usdcReserv = +formatUnits(poolInfo.balances[1], 6)
  // console.log('tetuReserv', tetuReserv);
  // console.log('usdcReserv', usdcReserv);

  const price = (usdcReserv / 0.2) / (tetuReserv / 0.8);
  // console.log('/// >>> PRICE: ', price);
  console.log(tetuReserv, usdcReserv, price);
  return price;
}

async function sellTetu(signer: SignerWithAddress, pool: string, amount: BigNumber) {
  const v = IBVault__factory.connect(MaticAddresses.BALANCER_VAULT, signer);
  await v.swap(
    {
      poolId: pool,
      kind: 0,
      assetIn: MaticAddresses.TETU_TOKEN,
      assetOut: MaticAddresses.USDC_TOKEN,
      amount,
      userData: ethers.utils.defaultAbiCoder.encode([], [])
    },
    {
      sender: signer.address,
      fromInternalBalance: false,
      recipient: signer.address,
      toInternalBalance: false
    },
    1,
    Math.round(Date.now() / 1000) * 2
  );
}

async function buyTetu(signer: SignerWithAddress, pool: string, amount: BigNumber) {
  const v = IBVault__factory.connect(MaticAddresses.BALANCER_VAULT, signer);
  await v.swap(
    {
      poolId: pool,
      kind: 0,
      assetIn: MaticAddresses.USDC_TOKEN,
      assetOut: MaticAddresses.TETU_TOKEN,
      amount,
      userData: ethers.utils.defaultAbiCoder.encode([], [])
    },
    {
      sender: signer.address,
      fromInternalBalance: false,
      recipient: signer.address,
      toInternalBalance: false
    },
    1,
    Math.round(Date.now() / 1000) * 2
  );
}


async function buyTetuInLoop(signer: SignerWithAddress, pool: string) {
  await TokenUtils.getToken(MaticAddresses.USDC_TOKEN, signer.address, parseUnits('5000000', 6));
  await IERC20__factory.connect(MaticAddresses.USDC_TOKEN, signer).approve(MaticAddresses.BALANCER_VAULT, Misc.MAX_UINT)

  for (let i = 0; i < 100; i++) {
    if (i < 1) {
      await buyTetu(signer, pool, parseUnits('9000', 6));
    } else {
      await buyTetu(signer, pool, parseUnits('10000', 6));
    }
    await poolPrice(signer, pool)
  }
}


async function sellTetuInLoop(signer: SignerWithAddress, pool: string) {
  console.log('DUMP!')

  await TokenUtils.getToken(MaticAddresses.TETU_TOKEN, signer.address, parseUnits('50000000'));
  await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, signer).approve(MaticAddresses.BALANCER_VAULT, Misc.MAX_UINT)

  for (let i = 0; i < 100; i++) {
    await sellTetu(signer, pool, parseUnits('500000'));
    await poolPrice(signer, pool)
  }
}
