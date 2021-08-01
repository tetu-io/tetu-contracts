import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {
  Announcer,
  Bookkeeper,
  Controller,
  IUniswapV2Pair,
  NoopStrategy,
  SmartVault
} from "../../../../typechain";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {ethers} from "hardhat";
import {UniswapUtils} from "../../../UniswapUtils";
import {BigNumber, utils} from "ethers";
import {Erc20Utils} from "../../../Erc20Utils";
import {TimeUtils} from "../../../TimeUtils";
import {VaultUtils} from "../../../VaultUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('TETU LP test', async () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let psVault: SmartVault;
  let tetuLpVault: SmartVault;
  let tetuLp: string;
  let tetuLpEmptyStrategy: NoopStrategy;
  let bookkeeper: Bookkeeper;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[4];
    const core = await DeployerUtils.getCoreAddresses();

    const announcer = await DeployerUtils.connectInterface(signer, 'Announcer', core.announcer) as Announcer;
    const controller = await DeployerUtils.connectInterface(signer, 'Controller', core.controller) as Controller;
    bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
    psVault = await DeployerUtils.connectInterface(signer, 'SmartVault', core.psVault) as SmartVault;

    // await MintHelperUtils.mintAll(controller, announcer, signer.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await controller.mintAndDistribute(0, core.notifyHelper, core.fundKeeper, true);

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('20000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('10000'));

    tetuLp = await UniswapUtils.addLiquidity(
        signer,
        core.rewardToken,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits('50000', 18).toString(),
        utils.parseUnits('5000', 6).toString(),
        MaticAddresses.SUSHI_FACTORY,
        MaticAddresses.SUSHI_ROUTER
    );

    console.log('lp', tetuLp);

    const lpCont = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', tetuLp) as IUniswapV2Pair
    const token0 = await lpCont.token0();
    const token0_name = await Erc20Utils.tokenSymbol(token0);
    const token1 = await lpCont.token1();
    const token1_name = await Erc20Utils.tokenSymbol(token1);

    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    tetuLpVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
    tetuLpEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller, tetuLp, tetuLpVault.address, [], [MaticAddresses.USDC_TOKEN, core.rewardToken]) as NoopStrategy;

    const vaultNameWithoutPrefix = `SUSHI_${token0_name}_${token1_name}`;

    await tetuLpVault.initializeSmartVault(
        `TETU_${vaultNameWithoutPrefix}`,
        `x${vaultNameWithoutPrefix}`,
        controller.address,
        tetuLp,
        60 * 60 * 24 * 28
    );

    await tetuLpVault.addRewardToken(core.psVault);

    await controller.addVaultAndStrategy(tetuLpVault.address, tetuLpEmptyStrategy.address);
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


  it("lp Tetu Vault base functionality", async () => {
    // const vaultUtils = new VaultUtils(vault);

    // ************** DEPOSIT *******************************
    let balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);

    await VaultUtils.deposit(signer, tetuLpVault, BigNumber.from("1000000"));

    let balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);
    expect(balanceAfter.toFixed(6)).is.eq((balanceBefore - (+utils.formatUnits("1000000", 6))).toFixed(6));

    expect(await Erc20Utils.balanceOf(tetuLpVault.address, signer.address)).at.eq("1000000");
    expect(await tetuLpVault.underlyingBalanceInVault()).at.eq("0");
    expect(await tetuLpVault.underlyingBalanceWithInvestment()).at.eq("1000000");
    expect(await tetuLpVault.underlyingBalanceWithInvestmentForHolder(signer.address)).at.eq("1000000");
    expect(await tetuLpVault.availableToInvestOut()).at.eq("0");
    expect(await tetuLpEmptyStrategy.underlyingBalance()).at.eq("1000000");
    expect(await tetuLpEmptyStrategy.investedUnderlyingBalance()).at.eq("1000000");
    expect(await bookkeeper.vaultUsersBalances(tetuLpVault.address, signer.address)).at.eq("1000000");
    expect(await bookkeeper.vaultUsersQuantity(tetuLpVault.address)).at.eq("1");

    // ************** GOV ACTIONS *******************************
    await tetuLpVault.addRewardToken(MaticAddresses.WMATIC_TOKEN);
    await tetuLpVault.removeRewardToken(MaticAddresses.WMATIC_TOKEN);
    await expect(tetuLpVault.removeRewardToken(psVault.address)).rejectedWith('last rt');

    expect(await tetuLpVault.rewardTokensLength()).at.eq(1);
    await tetuLpVault.doHardWork();
    await tetuLpVault.rebalance();

    // ************** WITHDRAW *******************************
    balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);

    await tetuLpVault.withdraw(BigNumber.from("500000"));

    balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);
    expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits("500000", 6)));


    expect(await Erc20Utils.balanceOf(tetuLpVault.address, signer.address)).at.eq("500000");
    expect(await tetuLpVault.underlyingBalanceInVault()).at.eq("0");
    expect(await tetuLpVault.underlyingBalanceWithInvestment()).at.eq("500000");
    expect(await tetuLpVault.underlyingBalanceWithInvestmentForHolder(signer.address)).at.eq("500000");
    expect(await tetuLpVault.availableToInvestOut()).at.eq("0");
    expect(await bookkeeper.vaultUsersBalances(tetuLpVault.address, signer.address)).at.eq("500000");
    expect(await bookkeeper.vaultUsersQuantity(tetuLpVault.address)).at.eq("1");

    // **************** DEPOSIT FOR ************
    balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);

    await Erc20Utils.approve(tetuLp, signer, tetuLpVault.address, "250000");
    await tetuLpVault.depositFor(BigNumber.from("250000"), signer.address);

    balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);
    expect(balanceAfter).is.eq(balanceBefore - (+utils.formatUnits("250000", 6)));

    expect(await Erc20Utils.balanceOf(tetuLpVault.address, signer.address)).at.eq("750000");
    expect(await tetuLpVault.underlyingBalanceInVault()).at.eq("250000");

    // ************* EXIT ***************
    balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);
    const fBal = await Erc20Utils.balanceOf(tetuLpVault.address, signer.address);
    await tetuLpVault.exit();

    balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tetuLp, signer.address), 6);
    expect(balanceAfter).is.eq(balanceBefore + (+utils.formatUnits(fBal, 6)));

    expect(await tetuLpVault.underlyingBalanceWithInvestment()).at.eq("0");
    expect(await bookkeeper.vaultUsersBalances(tetuLpVault.address, signer.address)).at.eq("0");
    expect(await bookkeeper.vaultUsersQuantity(tetuLpVault.address)).at.eq("0");
  });

});
