import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {PayrollClerk, PriceCalculator} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MintHelperUtils} from "../MintHelperUtils";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";
import {UniswapUtils} from "../UniswapUtils";
import {parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Payroll Clerk tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let clerk: PayrollClerk;
  let calculator: PriceCalculator;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    this.timeout(1200000);
    signer = await DeployerUtils.impersonate();
    core = await DeployerUtils.deployAllCoreContracts(signer);
    snapshot = await TimeUtils.snapshot();

    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
    networkToken = (await DeployerUtils.deployMockToken(signer, 'WETH')).address.toLowerCase();

    const uniData = await UniswapUtils.deployUniswap(signer);
    const factory = uniData.factory.address;
    const router = uniData.router.address;

    calculator = (await DeployerUtils.deployPriceCalculatorTestnet(signer, core.controller.address, usdc, factory))[0] as PriceCalculator;

    clerk = (await DeployerUtils.deployPayrollClerk(signer, core.controller.address, calculator.address))[0];

    await MintHelperUtils.mint(core.controller, core.announcer, '0', signer.address, true);
    await UniswapUtils.addLiquidity(
      signer,
      usdc,
      core.rewardToken.address,
      parseUnits('100', 6).toString(),
      parseUnits('100').toString(),
      factory,
      router,
    )
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


  it("should pay salary + change wallet", async () => {
    await clerk.addWorkers([signer.address], [100], ['Signer0'], ['TEST'], [true]);
    expect(await clerk.workerIndex(signer.address)).is.eq(0);
    await clerk.changeTokens([core.rewardToken.address], [100]);

    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, utils.parseUnits("1000").toString());

    const balance = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);

    await clerk.pay(signer.address, 1);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(balance.add(utils.parseUnits("100")));

    const newWallet = (await ethers.getSigners())[1];
    await clerk.changeWorkerAddress(signer.address, newWallet.address);

    expect(await clerk.workerIndex(newWallet.address)).is.eq(0);
    expect(await clerk.baseHourlyRates(newWallet.address)).is.eq(100);
    expect(await clerk.workedHours(newWallet.address)).is.eq(1);
    expect(await clerk.earned(newWallet.address)).is.eq('100000000000000000000');
    expect(await clerk.workerNames(newWallet.address)).is.eq('Signer0');
    expect(await clerk.workerRoles(newWallet.address)).is.eq('TEST');
    expect(await clerk.boostActivated(newWallet.address)).is.eq(true);
  });

  // TODO fix after contract changes
  it.skip("should pay salary with multiple tokens", async () => {
    await clerk.addWorker(signer.address, 100, 'Signer0', 'TEST', true);
    expect(await clerk.workersLength()).is.eq(1);
    expect((await clerk.allWorkers())[0]).is.eq(signer.address);
    expect(await clerk.isGovernance(signer.address)).is.eq(true);
    await clerk.changeTokens([core.rewardToken.address, networkToken], [50, 50]);

    await MintHelperUtils.mint(core.controller, core.announcer, '10000', signer.address);
    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, utils.parseUnits("1000").toString());

    // await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, networkToken, utils.parseUnits('10000'));
    await TokenUtils.transfer(networkToken, signer, clerk.address, utils.parseUnits("1000").toString());

    const balance1 = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);
    const balance2 = await TokenUtils.balanceOf(networkToken, signer.address);

    await clerk.multiplePay([signer.address], [2]);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(balance1.add(utils.parseUnits("100")));

    const p2 = await calculator.getPriceWithDefaultOutput(networkToken);

    expect(await TokenUtils.balanceOf(networkToken, signer.address))
      .eq(balance2.add(utils.parseUnits("100").mul(1e9).mul(1e9).div(p2)));
  });

  it("should pay salary with boost", async () => {
    await clerk.addWorker(signer.address, 100, 'Signer0', 'TEST', true);
    await clerk.changeTokens([core.rewardToken.address], [100]);

    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, utils.parseUnits("1000000").toString());

    const balance = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);

    await clerk.pay(signer.address, 1000);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(balance.add(utils.parseUnits("100000")));

    // second pay with boost

    const b = (await TokenUtils.balanceOf(core.rewardToken.address, signer.address)).toString();
    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, b);

    await clerk.pay(signer.address, 1);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(utils.parseUnits("200"));

    // third pay after downgrade

    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address,
      (await TokenUtils.balanceOf(core.rewardToken.address, signer.address)).toString());

    await clerk.setBaseHourlyRate(signer.address, 50);
    await clerk.pay(signer.address, 1);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(utils.parseUnits("150"));
  });

  it("should pay salary without boost", async () => {
    await clerk.addWorker(signer.address, 100, 'Signer0', 'TEST', true);
    await clerk.switchBoost(signer.address, false);
    await clerk.changeTokens([core.rewardToken.address], [100]);

    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, utils.parseUnits("1000000").toString());

    const balance = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);

    await clerk.pay(signer.address, 1000);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(balance.add(utils.parseUnits("100000")));

    // second pay without boost

    const b = (await TokenUtils.balanceOf(core.rewardToken.address, signer.address)).toString();
    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, b);

    await clerk.pay(signer.address, 1);

    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .eq(utils.parseUnits("100"));
  });

  it("should not pay salary for unknown worker", async () => {
    await expect(clerk.pay(signer.address, 1)).rejectedWith('worker not registered');
  });

  it("should not pay salary without funds", async () => {
    await clerk.addWorker(signer.address, 100, 'Signer0', 'TEST', true);
    await clerk.changeTokens([core.rewardToken.address], [100]);
    await expect(clerk.pay(signer.address, 1)).rejectedWith('not enough fund');
  });

  it("should salvage token", async () => {
    await TokenUtils.transfer(core.rewardToken.address, signer, clerk.address, utils.parseUnits("1000000").toString());
    const govBal = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);
    const bal = await TokenUtils.balanceOf(core.rewardToken.address, clerk.address);
    expect(bal.isZero()).is.eq(false);
    await clerk.moveTokensToGovernance(core.rewardToken.address, bal);
    expect((await TokenUtils.balanceOf(core.rewardToken.address, clerk.address)).isZero()).is.eq(true);
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .is.eq(govBal.add(bal));
  });

});
