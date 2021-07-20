import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {
  ContractReader,
  FeeRewardForwarder,
  GovernmentUpdatedProxy,
  PriceCalculator,
  SmartVault
} from "../../typechain";
import {MintHelperUtils} from "../MintHelperUtils";
import {Erc20Utils} from "../Erc20Utils";
import {utils} from "ethers";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("contract reader tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let core: CoreContractsWrapper;
  let contractReader: ContractReader;
  let calculator: PriceCalculator;


  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    core = await DeployerUtils.deployAllCoreContracts(signer);
    await core.mintHelper.startMinting();
    const logic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;
    const proxy = await DeployerUtils.deployContract(
        signer, "GovernmentUpdatedProxy", logic.address) as GovernmentUpdatedProxy;
    contractReader = logic.attach(proxy.address) as ContractReader;
    expect(await proxy.implementation()).is.eq(logic.address);
    await contractReader.initialize(core.controller.address);

    calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

    await contractReader.setPriceCalculator(calculator.address);

    for (let i = 0; i < 3; i++) {
      await DeployerUtils.deployAndInitVaultAndStrategy(
          "QUICK_WMATIC_WETH_" + i,
          "StrategyQuick_WMATIC_WETH",
          core.controller,
          core.psVault.address,
          signer
      );
    }

    // // create lp for price feed
    // await UniswapUtils.createPairForRewardToken(
    //     signer, core.rewardToken.address, core.mintHelper, "987000");
    //
    // const rewardTokenPrice = await calculator.getPriceWithDefaultOutput(core.rewardToken.address);
    // console.log('rewardTokenPrice', utils.formatUnits(rewardTokenPrice, 18), core.rewardToken.address);
    // expect(rewardTokenPrice.toString()).is.not.eq("0");
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


  it("vault rewards apr", async () => {

    // create lp for price feed
    await UniswapUtils.createPairForRewardToken(
        signer, core.rewardToken.address, core.mintHelper, "987000");

    const rewardTokenPrice = await calculator.getPriceWithDefaultOutput(core.rewardToken.address);
    console.log('rewardTokenPrice', utils.formatUnits(rewardTokenPrice, 18), core.rewardToken.address);
    expect(rewardTokenPrice.toString()).is.not.eq("0");

    await MintHelperUtils.mint(core.mintHelper, "100000");
    const rt = MaticAddresses.USDC_TOKEN;
    const rtDecimals = await Erc20Utils.decimals(rt);

    await UniswapUtils.swapExactTokensForTokens(
        signer,
        [core.rewardToken.address, rt],
        utils.parseUnits("10000", 18).toString(),
        signer.address,
        MaticAddresses.QUICK_ROUTER
    );

    // add rewards to PS
    const rewardAmount = utils.parseUnits("1000", rtDecimals).toString();
    console.log('rewardAmount', rewardAmount.toString());
    await core.psVault.addRewardToken(rt);
    await Erc20Utils.approve(rt, signer, core.psVault.address, rewardAmount);
    await core.psVault.notifyTargetRewardAmount(rt, rewardAmount);

    await deposit("30123", core.rewardToken.address, core.psVault, signer);

    const tvl = await contractReader.vaultTvl(core.psVault.address);
    console.log('tvl', tvl.toString(), utils.formatUnits(tvl));

    const vaultPrice = await contractReader.getPrice(core.psVault.address);
    console.log('vault price', utils.formatUnits(vaultPrice));

    const undrPrice = await contractReader.getPrice(core.rewardToken.address);
    console.log('undrPrice', utils.formatUnits(undrPrice));

    const ppfs = await core.psVault.getPricePerFullShare();
    console.log('ppfs', utils.formatUnits(ppfs));

    const tvlUsd = await contractReader.vaultTvlUsdc(core.psVault.address);
    const tvlUsdFormatted = +utils.formatUnits(tvlUsd);
    console.log('tvlUsd', tvlUsd.toString(), tvlUsdFormatted);
    const rtBalanceUsd = await Erc20Utils.balanceOf(rt, core.psVault.address);
    const rtBalanceUsdFormatted = +utils.formatUnits(rtBalanceUsd, rtDecimals);
    console.log('rtBalanceUsd', rtBalanceUsd.toString(), rtBalanceUsdFormatted);
    const periodFinish = await core.psVault.periodFinishForToken(rt);
    const curTime = Math.floor(Date.now() / 1000);
    const days = (periodFinish.toNumber() - curTime) / (60 * 60 * 24);
    console.log('days', days);

    const rewardsPerTvlRatio = rtBalanceUsdFormatted / tvlUsdFormatted;

    console.log('rewardsPerTvlRatio', rewardsPerTvlRatio);

    const expectedApr = (rewardsPerTvlRatio / days) * 365 * 100;

    console.log('expectedApr', expectedApr);

    const apr = (await contractReader.vaultRewardsApr(core.psVault.address))[0];
    const aprFormatted = +utils.formatUnits(apr, 18);
    console.log('apr', apr.toString(), aprFormatted)

    expect(aprFormatted)
    .is.approximately(expectedApr, expectedApr * 0.05);
  });

  it("vault rewards apr should be zero without price", async () => {
    await core.psVault.addRewardToken(MaticAddresses.USDC_TOKEN);
    expect((await contractReader.vaultRewardsApr(core.psVault.address))[0])
    .is.eq('0');
  });

  it("ps ppfs apr", async () => {
    await UniswapUtils.createPairForRewardToken(signer, core.rewardToken.address, core.mintHelper, "10000");
    await core.feeRewardForwarder.setConversionPath(
        [core.rewardToken.address, MaticAddresses.USDC_TOKEN],
        [MaticAddresses.QUICK_ROUTER]
    );

    await MintHelperUtils.mint(core.mintHelper, "100000");

    await deposit("25863", core.rewardToken.address, core.psVault, signer);

    await notifyPsPool("1234", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(1).and.is.lessThan(3);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(2000000).and.is.lessThan(10000000);

    await TimeUtils.advanceBlocksOnTs(60 * 60);

    await notifyPsPool("345", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(10000).and.is.lessThan(12000);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(45000).and.is.lessThan(50000);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 30);

    await notifyPsPool("345", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(300).and.is.lessThan(500);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(1800).and.is.lessThan(2000);
  });

  it("vault names", async () => {
    expect((await contractReader.vaultNamesList())[0])
    .is.eq('TETU_PS');
  });
  it("vault tvls", async () => {
    expect((await contractReader.vaultTvlsList())[0])
    .is.eq(0);
  });
  it("vault decimals", async () => {
    expect((await contractReader.vaultDecimalsList())[0])
    .is.eq(18);
  });
  it("vault platforms", async () => {
    expect((await contractReader.vaultPlatformsList())[0])
    .is.eq("NOOP");
  });
  it("vault assets", async () => {
    expect((await contractReader.vaultAssetsList())[0].length)
    .is.eq(1);
  });
  it("vault created", async () => {
    expect((await contractReader.vaultCreatedList())[0])
        .is.not.empty;
  });
  it("vault active", async () => {
    expect((await contractReader.vaultActiveList())[0])
        .is.true;
  });
  it("strategy created", async () => {
    expect((await contractReader.strategyCreatedList())[0])
        .is.not.empty;
  });
  it("strategy strategyAssetsList", async () => {
    expect((await contractReader.strategyAssetsList())[0].length)
    .is.eq(1);
  });
  it("vault user list", async () => {
    expect((await contractReader.vaultUsersList())[0])
    .is.eq(0);
  });
  it("strategy strategyRewardTokensList", async () => {
    expect((await contractReader.strategyRewardTokensList())[0].length)
    .is.eq(0);
  });
  it("strategy strategyPausedInvestingList", async () => {
    expect((await contractReader.strategyPausedInvestingList())[0])
        .is.false;
  });
  it("vaultDurationList", async () => {
    expect((await contractReader.vaultDurationList())[0])
    .is.eq("2419200");
  });
  it("strategyPlatformList", async () => {
    expect((await contractReader.strategyPlatformList())[0])
    .is.eq("NOOP");
  });
  it("user userRewardsList", async () => {
    const strategy = (await core.bookkeeper.strategies())[1];
    const rt = (await contractReader.strategyRewardTokens(strategy))[0];
    console.log('strat and rt', strategy, rt);
    expect((await contractReader.userRewardsList(signer.address, rt))[0])
    .is.eq("0");
  });
  it("proxy update", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'GovernmentUpdatedProxy', contractReader.address) as GovernmentUpdatedProxy;
    const newLogic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;
    await proxy.upgrade(newLogic.address);

    expect((await contractReader.vaultNamesList())[0])
    .is.eq('TETU_PS');
  });
  it("proxy should not update for non gov", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer1, 'GovernmentUpdatedProxy', contractReader.address) as GovernmentUpdatedProxy;
    const newLogic = await DeployerUtils.deployContract(signer1, "ContractReader") as ContractReader;
    await expect(proxy.upgrade(newLogic.address)).is.rejectedWith("forbidden");
  });
  it("should not update proxy with wrong contract", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'GovernmentUpdatedProxy', contractReader.address) as GovernmentUpdatedProxy;
    await expect(proxy.upgrade(core.mintHelper.address))
        .rejected;
  });
  it("should not update proxy with wrong contract", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'GovernmentUpdatedProxy', contractReader.address) as GovernmentUpdatedProxy;
    await expect(proxy.upgrade(core.bookkeeper.address))
        .rejected;
  });

  it("vault infos", async () => {
    const infos = await contractReader.vaultInfos();
    const info = infos[0];
    console.log('info', info);
    expect(info.name).is.eq('TETU_PS');
  });

  it("user infos", async () => {
    const infos = await contractReader.userInfos(signer.address);
    const info = infos[0];
    console.log('info', info);
    expect(info.vault).is.eq(core.psVault.address);
  });

  it("vault + user infos", async () => {
    const infos = await contractReader.vaultWithUserInfos(signer.address, {gasLimit: 50000000});
    const info = infos[0];
    expect(info.vault.name).is.eq('TETU_PS');
  });

  it("vault + user infos pages for other user", async () => {
    const infos = await contractReader.connect(signer1).vaultWithUserInfoPages(signer1.address, 0, 1);
    expect(infos.length).is.eq(1);
    const info = infos[0];
    expect(info.vault.name).is.eq('TETU_PS');
  });

  it("vault + user infos pages", async () => {
    const infos = await contractReader.vaultWithUserInfoPages(signer.address, 1, 2);
    expect(infos.length).is.eq(2);
    expect(infos[0].vault.name).is.eq('V_QUICK_WMATIC_WETH_1');
    expect(infos[1].vault.name).is.eq('V_QUICK_WMATIC_WETH_2');
  });

  it("vault + user infos all pages by one", async () => {
    const vaults = await contractReader.vaults();
    for (let i = 0; i < vaults.length; i++) {
      const infos = await contractReader.vaultWithUserInfoPages(signer.address, i, 1);
      expect(infos.length).is.eq(1);
      const info = infos[0];
      expect(info.vault.addr).is.eq(vaults[i]);
    }

  });

  it("vault + user infos all pages", async () => {
    const vaults = await contractReader.vaults();
    const infos = await contractReader.vaultWithUserInfoPages(signer.address, 0, vaults.length, {gasLimit: 50000000});
    expect(infos.length).is.eq(vaults.length);
    for (let i = 0; i < vaults.length; i++) {
      expect(infos[i].vault.addr).is.eq(vaults[i]);
    }
  });


});

async function lastPpfs(vault: string, contractReader: ContractReader): Promise<number> {
  return +(+utils.formatUnits(await contractReader.vaultPpfsLastApr(vault), 18)).toFixed();
}

async function allPpfs(vault: string, contractReader: ContractReader): Promise<number> {
  return +(+utils.formatUnits(await contractReader.vaultPpfsApr(vault), 18)).toFixed();
}

async function notifyPsPool(amount: string, token: string,
                            forwarder: FeeRewardForwarder, signer: SignerWithAddress) {
  const notify = utils.parseUnits(amount, 18);
  await Erc20Utils.approve(token, signer, forwarder.address, notify.toString());
  await forwarder.notifyPsPool(token, notify)
}

async function deposit(amount: string, token: string, vault: SmartVault, signer: SignerWithAddress) {
  const deposit = utils.parseUnits(amount, 18);
  await Erc20Utils.approve(token, signer, vault.address, deposit.toString());
  await vault.depositAndInvest(deposit);
}
