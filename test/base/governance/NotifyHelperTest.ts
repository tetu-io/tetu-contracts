import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {IStrategy, NoopStrategy, NotifyHelper} from "../../../typechain";
import {Misc} from "../../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Notify Helper test", () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let notifier: NotifyHelper;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    console.log("snapshot", snapshot);
    signer = (await ethers.getSigners())[0];
    user = (await ethers.getSigners())[1];

    core = await DeployerUtils.deployAllCoreContracts(signer);
    notifier = core.notifyHelper;
    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', signer.address);
    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', core.notifyHelper.address);

    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));

    for (let i = 0; i < 2; i++) {
      await DeployerUtils.deployAndInitVaultAndStrategy(
        usdc,
        't',
        vaultAddress => DeployerUtils.deployContract(
          signer,
          'NoopStrategy',
          core.controller.address, // _controller
          usdc, // _underlying
          vaultAddress,
          [core.psVault.address], // __rewardTokens
          [usdc], // __assets
          1 // __platform
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
      );
    }
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

  it("should distribute PS rewards", async () => {

    const allVaults: string[] = await core.bookkeeper.vaults();

    const vaults: string[] = [];
    const amounts: BigNumber[] = [];
    let sum = BigNumber.from("0");
    for (const vault of allVaults) {
      if (vault === core.psVault.address) {
        continue;
      }
      vaults.push(vault);
      const amount = utils.parseUnits("1", 18);
      amounts.push(amount);
      sum = sum.add(amount);
    }

    // await Erc20Utils.transfer(core.rewardToken.address, signer, core.notifyHelper.address, sum.toString());
    const tokenBal = await TokenUtils.balanceOf(core.rewardToken.address, core.notifyHelper.address);
    console.log("rtBalance", utils.formatUnits(tokenBal, 18));
    await core.notifyHelper.notifyVaults(amounts, vaults, sum, core.rewardToken.address);

    for (const vault of vaults) {
      expect(await TokenUtils.balanceOf(core.psVault.address, vault)).is.eq(utils.parseUnits("1", 18).toString());
    }

  });

  it("should distribute to dxTETU", async () => {
    const underlying = core.psVault.address;
    const vault = await DeployerUtils.deploySmartVault(signer);
    console.log('vault.address', vault.address);
    const rt = vault.address;
    const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      core.controller.address, underlying, vault.address, [Misc.ZERO_ADDRESS], [underlying], 1) as NoopStrategy;
    await vault.initializeSmartVault(
      "NOOP",
      "tNOOP",
      core.controller.address,
      underlying,
      60 * 60 * 24 * 28,
      true,
      rt,
      0
    );
    await core.controller.addVaultsAndStrategies([vault.address], [strategy.address]);
    await vault.setLockPenalty(10);
    await vault.setLockPeriod(1);

    const dxTETU = vault.address;

    await core.notifyHelper.setDXTetu(dxTETU);

    const amount = utils.parseUnits("1", 18);
    const tokenBal = await TokenUtils.balanceOf(core.rewardToken.address, core.notifyHelper.address);
    console.log("rtBalance", utils.formatUnits(tokenBal, 18));
    await core.notifyHelper.notifyVaults([amount], [dxTETU], amount, core.rewardToken.address);
    expect(await TokenUtils.balanceOf(dxTETU, dxTETU)).is.eq(utils.parseUnits("1", 18).toString());

  });

  it("should distribute other rewards", async () => {
    const rt = networkToken;
    const allVaults: string[] = await core.bookkeeper.vaults();

    const vaults: string[] = [];
    const amounts: BigNumber[] = [];
    let sum = BigNumber.from("0");
    for (const vault of allVaults) {
      vaults.push(vault);
      const amount = utils.parseUnits("1");
      amounts.push(amount);
      sum = sum.add(amount);
      await core.vaultController.addRewardTokens([vault], rt);
    }

    expect(+utils.formatUnits(await TokenUtils.balanceOf(rt, signer.address), 6))
      .is.greaterThanOrEqual(1000);

    await TokenUtils.transfer(rt, signer, core.notifyHelper.address, sum.toString());
    expect(+utils.formatUnits(await TokenUtils.balanceOf(rt, core.notifyHelper.address), 18))
      .is.eq(+utils.formatUnits(sum, 18));


    await core.notifyHelper.notifyVaults(amounts, vaults, sum, rt);

    for (const vault of vaults) {
      expect(await TokenUtils.balanceOf(rt, vault)).is.eq(utils.parseUnits("1").toString());
    }

  });

  it("check main stats", async () => {
    expect(await TokenUtils.balanceOf(core.rewardToken.address, core.notifyHelper.address)).is.eq("901000000000000000000000");
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address)).is.eq("1099000000000000000000000");
    await TokenUtils.transfer(core.rewardToken.address, signer, core.notifyHelper.address, "1099000000000000000000000");
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address)).is.eq("0");
    // await core.notifyHelper.moveFunds(core.rewardToken.address, signer.address);
    // expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address)).is.eq("1000000000000000000000000");
  });

  // it("should not move funds to zero address", async () => {
  //   expect(notifier.moveFunds(MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS))
  //   .rejectedWith('address is zero');
  // });

  it("should not notify without balance", async () => {
    await expect(notifier.notifyVaults(['1'], [Misc.ZERO_ADDRESS], '1', usdc))
      .rejectedWith('NH: Not enough balance');
  });

  it("should not notify with wrong data", async () => {
    const amount = utils.parseUnits('1000', 6);
    await TokenUtils.transfer(usdc, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['1'], [], '1', usdc))
      .rejectedWith('wrong data');
  });

  it("should not notify with zero amount", async () => {
    const amount = utils.parseUnits('1000', 6);
    await TokenUtils.transfer(usdc, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['0'], [Misc.ZERO_ADDRESS], '1', usdc))
      .rejectedWith('Notify zero');
  });

  it("should not notify with wrong vault", async () => {
    const amount = utils.parseUnits('1000', 6);
    await TokenUtils.transfer(usdc, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['1'], [Misc.ZERO_ADDRESS], '1', usdc))
      .rejectedWith('Vault not registered');
  });

  it("should not notify ps", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('1000', rtDecimals);
    await TokenUtils.transfer(rt, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(
      [utils.parseUnits('500', rtDecimals), utils.parseUnits('500', rtDecimals)],
      [allVaults[0], allVaults[0]],
      amount,
      rt)
    ).rejectedWith("NH: No rewards");
  });

  it("should not notify with duplicate vault", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('1000', rtDecimals);
    await TokenUtils.transfer(rt, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(
      [utils.parseUnits('500', rtDecimals), utils.parseUnits('500', rtDecimals)],
      [allVaults[1], allVaults[1]],
      amount,
      rt)
    ).rejectedWith('Duplicate pool');
  });

  it("should not notify with duplicate vault with different tx", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('500', rtDecimals);
    await TokenUtils.transfer(rt, signer, notifier.address, amount.toString())
    await notifier.notifyVaults(
      [utils.parseUnits('250', rtDecimals), utils.parseUnits('250', rtDecimals)],
      [allVaults[1], allVaults[2]],
      amount,
      rt);

    await expect(notifier.notifyVaults(
      [utils.parseUnits('250', rtDecimals)],
      [allVaults[1]],
      utils.parseUnits('250', rtDecimals),
      rt)
    ).rejectedWith('Duplicate pool');
  });

  it("should notify vaults again with different tx after clear", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('500', rtDecimals);
    await TokenUtils.transfer(rt, signer, notifier.address, amount.toString())
    await notifier.notifyVaults(
      [utils.parseUnits('250', rtDecimals), utils.parseUnits('250', rtDecimals)],
      [allVaults[1], allVaults[2]],
      amount,
      rt);

    await notifier.clearNotifiedStatuses();

    expect((await notifier.alreadyNotifiedListLength())).is.eq(0);

    await notifier.notifyVaults(
      [utils.parseUnits('250', rtDecimals)],
      [allVaults[1]],
      utils.parseUnits('250', rtDecimals),
      rt);
  });

  it("should move tokens", async () => {
    const amount = utils.parseUnits('1000', 6);
    await TokenUtils.transfer(usdc, signer, notifier.address, amount.toString());
    await notifier.moveTokensToController(usdc, amount);
    expect(await TokenUtils.balanceOf(usdc, core.controller.address))
      .is.eq(amount);
  });

});
