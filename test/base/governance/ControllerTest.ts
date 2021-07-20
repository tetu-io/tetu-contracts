import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Bookkeeper, Controller, NoopStrategy} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {Erc20Utils} from "../../Erc20Utils";
import {utils} from "ethers";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";

const {expect} = chai;
chai.use(chaiAsPromised);

const REWARD_DURATION = 60 * 60;

describe("Controller tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  const underlying = MaticAddresses.USDC_TOKEN;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let controller: Controller;
  let bookkeeper: Bookkeeper;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    controller = core.controller;
    bookkeeper = core.bookkeeper;
    await UniswapUtils.wrapMatic(signer); // 10m wmatic
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


  it("should change governance", async () => {
    await controller.setGovernance(signer1.address);
    await expect(controller.setGovernance(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
    const cS1 = controller.connect(signer1);
    expect(await cS1.isGovernance(signer1.address)).at.eq(true);
    await cS1.setGovernance(signerAddress);
    expect(await controller.isGovernance(signerAddress)).at.eq(true);
  });
  it("ps numerator denominator update", async () => {
    await controller.setPSNumeratorDenominator(10, 1000);
    expect(await controller.psNumerator()).at.eq(10);
    expect(await controller.psDenominator()).at.eq(1000);
    await expect(controller.connect(signer1).setGovernance(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
  });
  it("should add and remove hardworker", async () => {
    await controller.addHardWorker(MaticAddresses.USDC_TOKEN);
    expect(await controller.isHardWorker(MaticAddresses.USDC_TOKEN)).at.eq(true);
    await controller.removeHardWorker(MaticAddresses.USDC_TOKEN);
    expect(await controller.isHardWorker(MaticAddresses.USDC_TOKEN)).at.eq(false);
    await expect(controller.connect(signer1).addHardWorker(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
    await expect(controller.connect(signer1).removeHardWorker(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
  });
  it("should add and remove to whitelist", async () => {
    await controller.addToWhiteListMulti([MaticAddresses.USDC_TOKEN]);
    expect(await controller.isAllowedUser(MaticAddresses.USDC_TOKEN)).at.eq(true);
    await controller.removeFromWhiteListMulti([MaticAddresses.USDC_TOKEN]);
    expect(await controller.isAllowedUser(MaticAddresses.USDC_TOKEN)).at.eq(false);
    await expect(controller.connect(signer1).addToWhiteList(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
    await expect(controller.connect(signer1).removeFromWhiteList(MaticAddresses.USDC_TOKEN)).to.be.rejectedWith("not governance");
  });
  it("should add vault and strategy", async () => {
    const vault = await DeployerUtils.deploySmartVault(signer);
    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        controller.address,
        underlying,
        REWARD_DURATION
    );
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        controller.address, underlying, vault.address, [MaticAddresses.WMATIC_TOKEN], [underlying]) as NoopStrategy;
    await controller.addVaultsAndStrategies([vault.address], [strategy.address]);
    expect(await controller.isValidVault(vault.address)).at.eq(true);
    expect(await controller.strategies(strategy.address)).at.eq(true);
    expect(await vault.strategy()).at.eq(strategy.address);
    expect((await bookkeeper.vaults())[1]).at.eq(vault.address);
    expect((await bookkeeper.strategies())[1]).at.eq(strategy.address);

    await expect(controller.connect(signer1).addVaultAndStrategy(MaticAddresses.USDC_TOKEN, MaticAddresses.USDC_TOKEN))
    .to.be.rejectedWith("not governance");
  });
  it("should doHardWork", async () => {
    const vault = await DeployerUtils.deploySmartVault(signer);
    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        controller.address,
        underlying,
        REWARD_DURATION
    );
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying]) as NoopStrategy;
    await controller.addVaultAndStrategy(vault.address, strategy.address);

    await controller.doHardWork(vault.address);

    await expect(controller.connect(signer1).doHardWork(vault.address))
    .to.be.rejectedWith("only hardworker");
  });
  it("should salvage", async () => {

    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER,
        MaticAddresses.USDC_TOKEN, utils.parseUnits("10000", 18))

    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, controller.address, "100");

    const balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address), 6);
    await controller.salvage(MaticAddresses.USDC_TOKEN, 100);
    const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address), 6);
    expect(balanceAfter).is.greaterThan(balanceBefore);
  });

  it("should not salvage", async () => {
    await expect(controller.connect(signer1).salvage(MaticAddresses.USDC_TOKEN, 100))
    .to.be.rejectedWith("not governance");
  });
  it("created", async () => {
    expect(await controller.created()).is.not.eq("0");
  });

  it("should not setup strategy", async () => {
    await expect(controller.addStrategy(MaticAddresses.ZERO_ADDRESS)).rejectedWith('only exist active vault');
  });

  it("should not setup exist strategy", async () => {
    const strat = await core.psVault.strategy();
    controller.addStrategy(strat);
  });

  it("should not setup zero gov", async () => {
    await expect(controller.setGovernance(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero forwarder", async () => {
    await expect(controller.setFeeRewardForwarder(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero bookkeeper", async () => {
    await expect(controller.setBookkeeper(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero mint helper", async () => {
    await expect(controller.setMintHelper(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero notifier", async () => {
    await expect(controller.setNotifyHelper(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero ps vault", async () => {
    await expect(controller.setPsVault(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup wrong ps rate", async () => {
    await expect(controller.setPSNumeratorDenominator('100', '99')).rejectedWith('invalid values');
    await expect(controller.setPSNumeratorDenominator('0', '0')).rejectedWith('cannot divide by 0');
  });

  it("should not setup zero hard worker", async () => {
    await expect(controller.addHardWorker(MaticAddresses.ZERO_ADDRESS)).rejectedWith('_worker must be defined');
  });

  it("should not remove zero hard worker", async () => {
    await expect(controller.removeHardWorker(MaticAddresses.ZERO_ADDRESS)).rejectedWith('_worker must be defined');
  });

  it("should not add zero vault", async () => {
    await expect(controller.addVaultAndStrategy(MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS)).rejectedWith('new vault shouldn\'t be empty');
  });

  it("should not add exist vault", async () => {
    await expect(controller.addVaultAndStrategy(core.psVault.address, MaticAddresses.ZERO_ADDRESS)).rejectedWith('vault already exists');
  });

  it("should not add zero strategy", async () => {
    await expect(controller.addVaultAndStrategy(core.bookkeeper.address, MaticAddresses.ZERO_ADDRESS)).rejectedWith('new strategy must not be empty');
  });

  it("should not setup zero reward token", async () => {
    await expect(controller.setRewardToken(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero fund token", async () => {
    await expect(controller.setFundToken(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup zero fund", async () => {
    await expect(controller.setFund(MaticAddresses.ZERO_ADDRESS)).rejectedWith('zero address');
  });

  it("should not setup wrong fund rate", async () => {
    await expect(controller.setFundNumeratorDenominator('100', '99')).rejectedWith('invalid values');
    await expect(controller.setFundNumeratorDenominator('0', '0')).rejectedWith('cannot divide by 0');
  });

  it("should not add wrong arrays for vaults and strategies", async () => {
    await expect(controller.addVaultsAndStrategies([MaticAddresses.ZERO_ADDRESS], [])).rejectedWith('arrays wrong length');
  });

  it("should not doHardWork for wrong vault", async () => {
    await expect(controller.doHardWork(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not vault');
  });

});
