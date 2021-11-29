import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../scripts/addresses/MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Bookkeeper, Controller, NoopStrategy} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
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
        REWARD_DURATION,
        false,
        MaticAddresses.ZERO_ADDRESS
    );
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        controller.address, underlying, vault.address, [MaticAddresses.WMATIC_TOKEN], [underlying], 1) as NoopStrategy;
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
        REWARD_DURATION,
        false,
        MaticAddresses.ZERO_ADDRESS
    );
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying], 1) as NoopStrategy;
    await controller.addVaultAndStrategy(vault.address, strategy.address);

    await controller.doHardWork(vault.address);

    await expect(controller.connect(signer1).doHardWork(vault.address))
    .to.be.rejectedWith("only hardworker");
  });

  it("should not salvage", async () => {
    await expect(controller.connect(signer1).controllerTokenMove(signer.address, MaticAddresses.USDC_TOKEN, 100))
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
    await expect(controller.addStrategy(strat)).rejectedWith('only exist active vault');
  });

  it("should not set gov without announce", async () => {
    await expect(controller.setGovernance(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup forwarder without announce", async () => {
    await expect(controller.setFeeRewardForwarder(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup bookkeeper without announce", async () => {
    await expect(controller.setBookkeeper(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup mint helper without announce", async () => {
    await expect(controller.setMintHelper(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup ps vault without announce", async () => {
    await expect(controller.setPsVault(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup ps rate without announce", async () => {
    await expect(controller.setPSNumeratorDenominator('100', '99')).rejectedWith('not announced');
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

  it("should not setup reward token without announce", async () => {
    await expect(controller.setRewardToken(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup fund token without announce", async () => {
    await expect(controller.setFundToken(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup fund without announce", async () => {
    await expect(controller.setFund(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not announced');
  });

  it("should not setup fund rate without announce", async () => {
    await expect(controller.setFundNumeratorDenominator('100', '99')).rejectedWith('not announced');
  });

  it("should not add wrong arrays for vaults and strategies", async () => {
    await expect(controller.addVaultsAndStrategies([MaticAddresses.ZERO_ADDRESS], [])).rejectedWith('arrays wrong length');
  });

  it("should not doHardWork for wrong vault", async () => {
    await expect(controller.doHardWork(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not vault');
  });

});
