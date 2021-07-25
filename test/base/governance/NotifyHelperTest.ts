import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {BigNumber, utils} from "ethers";
import {Erc20Utils} from "../../Erc20Utils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {MaticAddresses} from "../../MaticAddresses";
import {UniswapUtils} from "../../UniswapUtils";
import {NotifyHelper} from "../../../typechain/NotifyHelper";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Notify Helper test", () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let notifier: NotifyHelper;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    console.log("snapshot", snapshot);
    signer = (await ethers.getSigners())[0];
    user = (await ethers.getSigners())[1];

    core = await DeployerUtils.deployAllCoreContracts(signer);
    notifier = core.notifyHelper;
    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', signer.address);
    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', core.notifyHelper.address);

    await UniswapUtils.wrapMatic(signer); // 10m wmatic
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('100000'));

    for (let i = 0; i < 2; i++) {
      const data = await DeployerUtils.deployAndInitVaultAndStrategy(
          "QUICK_WMATIC_WETH_" + i,
          "StrategyQuick_WMATIC_WETH",
          core.controller,
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
    for (let vault of allVaults) {
      if (vault === core.psVault.address) {
        continue;
      }
      vaults.push(vault);
      const amount = utils.parseUnits("1", 18);
      amounts.push(amount);
      sum = sum.add(amount);
    }

    // await Erc20Utils.transfer(core.rewardToken.address, signer, core.notifyHelper.address, sum.toString());
    const tokenBal = await Erc20Utils.balanceOf(core.rewardToken.address, core.notifyHelper.address);
    console.log("rtBalance", utils.formatUnits(tokenBal, 18));
    await core.notifyHelper.notifyVaults(amounts, vaults, sum, core.rewardToken.address);

    for (let vault of vaults) {
      expect(await Erc20Utils.balanceOf(core.psVault.address, vault)).is.eq(utils.parseUnits("1", 18).toString());
    }

  });

  it("should distribute other rewards", async () => {
    const rt = MaticAddresses.USDC_TOKEN;
    const allVaults: string[] = await core.bookkeeper.vaults();

    const vaults: string[] = [];
    const amounts: BigNumber[] = [];
    let sum = BigNumber.from("0");
    for (let vault of allVaults) {
      vaults.push(vault);
      const amount = utils.parseUnits("1", 6);
      amounts.push(amount);
      sum = sum.add(amount);
      const v = await DeployerUtils.connectVault(vault, signer);
      await v.addRewardToken(rt);
    }

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER,
        MaticAddresses.WMATIC_TOKEN, utils.parseUnits("10000", 18));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, rt, utils.parseUnits("1000", 18));
    expect(+utils.formatUnits(await Erc20Utils.balanceOf(rt, signer.address), 6))
    .is.greaterThanOrEqual(1000);

    await Erc20Utils.transfer(rt, signer, core.notifyHelper.address, sum.toString());
    expect(+utils.formatUnits(await Erc20Utils.balanceOf(rt, core.notifyHelper.address), 18))
    .is.eq(+utils.formatUnits(sum, 18));


    await core.notifyHelper.notifyVaults(amounts, vaults, sum, rt);

    for (let vault of vaults) {
      expect(await Erc20Utils.balanceOf(rt, vault)).is.eq(utils.parseUnits("1", 6).toString());
    }

  });

  it("check main stats", async () => {
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, core.notifyHelper.address)).is.eq("901000000000000000000000");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address)).is.eq("1099000000000000000000000");
    await Erc20Utils.transfer(core.rewardToken.address, signer, core.notifyHelper.address, "1099000000000000000000000");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address)).is.eq("0");
    // await core.notifyHelper.moveFunds(core.rewardToken.address, signer.address);
    // expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address)).is.eq("1000000000000000000000000");
  });

  // it("should not move funds to zero address", async () => {
  //   await expect(notifier.moveFunds(MaticAddresses.ZERO_ADDRESS, MaticAddresses.ZERO_ADDRESS))
  //   .rejectedWith('address is zero');
  // });

  it("should not notify without balance", async () => {
    await expect(notifier.notifyVaults(['1'], [MaticAddresses.ZERO_ADDRESS], '1', MaticAddresses.USDC_TOKEN))
    .rejectedWith('not enough balance');
  });

  it("should not notify with wrong data", async () => {
    const amount = utils.parseUnits('1000', 6);
    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['1'], [], '1', MaticAddresses.USDC_TOKEN))
    .rejectedWith('wrong data');
  });

  it("should not notify with zero amount", async () => {
    const amount = utils.parseUnits('1000', 6);
    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['0'], [MaticAddresses.ZERO_ADDRESS], '1', MaticAddresses.USDC_TOKEN))
    .rejectedWith('Notify zero');
  });

  it("should not notify with wrong vault", async () => {
    const amount = utils.parseUnits('1000', 6);
    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(['1'], [MaticAddresses.ZERO_ADDRESS], '1', MaticAddresses.USDC_TOKEN))
    .rejectedWith('Vault not registered');
  });

  it("should not notify ps", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('1000', rtDecimals);
    await Erc20Utils.transfer(rt, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(
        [utils.parseUnits('500', rtDecimals), utils.parseUnits('500', rtDecimals)],
        [allVaults[0], allVaults[0]],
        amount,
        rt)
    ).rejectedWith('ps forbidden');
  });

  it("should not notify with duplicate vault", async () => {
    const allVaults: string[] = await core.bookkeeper.vaults();
    const rtDecimals = 18;
    const rt = core.rewardToken.address;
    const amount = utils.parseUnits('1000', rtDecimals);
    await Erc20Utils.transfer(rt, signer, notifier.address, amount.toString())
    await expect(notifier.notifyVaults(
        [utils.parseUnits('500', rtDecimals), utils.parseUnits('500', rtDecimals)],
        [allVaults[1], allVaults[1]],
        amount,
        rt)
    ).rejectedWith('Duplicate pool');
  });

});
