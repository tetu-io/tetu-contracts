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
  IStrategy,
  PriceCalculator,
  SmartVault,
  TetuProxyGov
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
    const logic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;
    const proxy = await DeployerUtils.deployContract(
        signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    contractReader = logic.attach(proxy.address) as ContractReader;
    expect(await proxy.implementation()).is.eq(logic.address);

    calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

    await contractReader.initialize(core.controller.address, calculator.address);

    for (let i = 0; i < 3; i++) {
      await DeployerUtils.deployAndInitVaultAndStrategy(
          "WAULT_WEX_" + i,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              'StrategyWaultSingle',
              core.controller.address,
              vaultAddress,
              MaticAddresses.WEXpoly_TOKEN,
              1
          ) as Promise<IStrategy>,
          core.controller,
          core.vaultController,
          MaticAddresses.WMATIC_TOKEN,
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


  it("vault rewards apr", async () => {

    // create lp for price feed
    await UniswapUtils.createPairForRewardToken(signer, core, "987000");

    const rewardTokenPrice = await calculator.getPriceWithDefaultOutput(core.rewardToken.address);
    console.log('rewardTokenPrice', utils.formatUnits(rewardTokenPrice, 18), core.rewardToken.address);
    expect(rewardTokenPrice.toString()).is.not.eq("0");

    await MintHelperUtils.mint(core.controller, core.announcer, '100000', signer.address);
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
    await core.vaultController.addRewardTokens([core.psVault.address], rt);
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
    .is.approximately(expectedApr, expectedApr * 0.2);
  });

  it("vault rewards apr should be zero without price", async () => {
    await core.vaultController.addRewardTokens([core.psVault.address], MaticAddresses.USDC_TOKEN);
    expect((await contractReader.vaultRewardsApr(core.psVault.address))[0])
    .is.eq('0');
  });

  it("ps ppfs apr", async () => {
    await UniswapUtils.createPairForRewardToken(signer, core, "10000");
    await core.feeRewardForwarder.setConversionPath(
        [core.rewardToken.address, MaticAddresses.USDC_TOKEN],
        [MaticAddresses.QUICK_ROUTER]
    );

    await MintHelperUtils.mint(core.controller, core.announcer, '100000', signer.address);

    await deposit("25863", core.rewardToken.address, core.psVault, signer);

    await notifyPsPool("1234", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(1).and.is.lessThan(3);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(200).and.is.lessThan(1000);

    await TimeUtils.advanceBlocksOnTs(60 * 60);

    await notifyPsPool("345", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(10000).and.is.lessThan(12000);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(400).and.is.lessThan(1000);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 30);

    await notifyPsPool("345", core.rewardToken.address, core.feeRewardForwarder, signer);
    expect(await lastPpfs(core.psVault.address, contractReader)).is.greaterThan(300).and.is.lessThan(500);
    expect(await allPpfs(core.psVault.address, contractReader)).is.greaterThan(400).and.is.lessThan(1000);
  });


  it("proxy update", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'TetuProxyGov', contractReader.address) as TetuProxyGov;
    const newLogic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;
    await proxy.upgrade(newLogic.address);

    expect((await contractReader.vaults())[0])
    .is.eq(core.psVault.address);
  });
  it("proxy should not update for non gov", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer1, 'TetuProxyGov', contractReader.address) as TetuProxyGov;
    const newLogic = await DeployerUtils.deployContract(signer1, "ContractReader") as ContractReader;
    await expect(proxy.upgrade(newLogic.address)).is.rejectedWith("forbidden");
  });
  it("should not update proxy with wrong contract", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'TetuProxyGov', contractReader.address) as TetuProxyGov;
    await expect(proxy.upgrade(core.mintHelper.address))
        .rejected;
  });
  it("should not update proxy with wrong contract", async () => {
    const proxy = await DeployerUtils.connectContract(
        signer, 'TetuProxyGov', contractReader.address) as TetuProxyGov;
    await expect(proxy.upgrade(core.bookkeeper.address))
        .rejected;
  });

  it("vault + user infos", async () => {
    const infos = await contractReader.vaultWithUserInfos(signer.address, [core.psVault.address]);
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
    expect(infos[0].vault.name).is.eq('TETU_WAULT_WEX_1');
    expect(infos[1].vault.name).is.eq('TETU_WAULT_WEX_2');
  });

  it("vault + user infos pages light", async () => {
    const infos = await contractReader.vaultWithUserInfoPagesLight(signer.address, 1, 2);
    expect(infos.length).is.eq(2);
    expect(infos[0].vault.underlying.toLowerCase()).is.eq(MaticAddresses.WEXpoly_TOKEN);
    expect(infos[1].vault.underlying.toLowerCase()).is.eq(MaticAddresses.WEXpoly_TOKEN);
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

  // it("deploy all and check", async () => {
  //   let infos = readFileSync('scripts/utils/generate/quick/quick_pools.csv', 'utf8').split(/\r?\n/);
  //   const deployed = [];
  //
  //   for (let info of infos) {
  //     const strat = info.split(',');
  //
  //     const ids = strat[0];
  //     const lp_name = strat[1];
  //     const lp_address = strat[2];
  //     const token0 = strat[3];
  //     const token0_name = strat[4];
  //     const token1 = strat[5];
  //     const token1_name = strat[6];
  //     const pool = strat[7];
  //     const duration = strat[9];
  //
  //     if (+duration <= 0 || !token0 || ids === 'idx') {
  //       console.log('skip', ids);
  //       continue;
  //     }
  //
  //     const vaultNameWithoutPrefix = `QUICK_${token0_name}_${token1_name}`;
  //
  //     console.log('strat', ids, lp_name);
  //
  //     const data = await DeployerUtils.deployAndInitVaultAndStrategy(
  //         vaultNameWithoutPrefix,
  //         vaultAddress => DeployerUtils.deployContract(
  //             signer,
  //             'StrategyQuickSwapLp',
  //             core.controller,
  //             vaultAddress,
  //             lp_address,
  //             token0,
  //             token1,
  //             pool
  //         ) as Promise<IStrategy>,
  //         core.controller,
  //         core.psVault.address,
  //         signer,
  //         60 * 60 * 24 * 28,
  //         false
  //     );
  //     data.push([
  //       core.controller,
  //       data[1].address,
  //       lp_address,
  //       token0,
  //       token1,
  //       pool
  //     ]);
  //     deployed.push(data);
  //   }
  //
  //   infos = readFileSync('scripts/utils/generate/sushi/sushi_pools.csv', 'utf8').split(/\r?\n/);
  //
  //
  //   for (let info of infos) {
  //     const strat = info.split(',');
  //
  //     const idx = strat[0];
  //     const lp_name = strat[1];
  //     const lp_address = strat[2];
  //     const token0 = strat[3];
  //     const token0_name = strat[4];
  //     const token1 = strat[5];
  //     const token1_name = strat[6];
  //     const alloc = strat[7];
  //
  //     if (+alloc <= 0 || idx === 'idx' || !idx) {
  //       console.log('skip', idx);
  //       continue;
  //     }
  //
  //     const vaultNameWithoutPrefix = `SUSHI_${token0_name}_${token1_name}`;
  //     console.log('strat', idx, lp_name);
  //
  //     const data = await DeployerUtils.deployAndInitVaultAndStrategy(
  //         vaultNameWithoutPrefix,
  //         vaultAddress => DeployerUtils.deployContract(
  //             signer,
  //             'StrategySushiSwapLp',
  //             core.controller,
  //             vaultAddress,
  //             lp_address,
  //             token0,
  //             token1,
  //             idx
  //         ) as Promise<IStrategy>,
  //         core.controller,
  //         core.psVault.address,
  //         signer,
  //         60 * 60 * 24 * 28,
  //         false
  //     );
  //     data.push([
  //       core.controller,
  //       data[1].address,
  //       lp_address,
  //       token0,
  //       token1,
  //       idx
  //     ]);
  //     deployed.push(data);
  //   }
  //
  //   infos = readFileSync('scripts/utils/generate/wault/wault_pools.csv', 'utf8').split(/\r?\n/);
  //
  //   for (let info of infos) {
  //     const strat = info.split(',');
  //
  //     const idx = strat[0];
  //     const lp_name = strat[1];
  //     const lp_address = strat[2];
  //     const token0 = strat[3];
  //     const token0_name = strat[4];
  //     const token1 = strat[5];
  //     const token1_name = strat[6];
  //     const alloc = strat[7];
  //
  //     if (+alloc <= 0 || idx === 'idx' || idx == '0' || !lp_name) {
  //       console.log('skip', idx);
  //       continue;
  //     }
  //
  //     let vaultNameWithoutPrefix: string;
  //     if (token1) {
  //       vaultNameWithoutPrefix = `WAULT_${token0_name}_${token1_name}`;
  //     } else {
  //       vaultNameWithoutPrefix = `WAULT_${token0_name}`;
  //     }
  //
  //     console.log('strat', idx, lp_name);
  //
  //     let data: any[];
  //     if (token1) {
  //       data = await DeployerUtils.deployAndInitVaultAndStrategy(
  //           vaultNameWithoutPrefix,
  //           vaultAddress => DeployerUtils.deployContract(
  //               signer,
  //               'StrategyWaultLp',
  //               core.controller,
  //               vaultAddress,
  //               lp_address,
  //               token0,
  //               token1,
  //               idx
  //           ) as Promise<IStrategy>,
  //           core.controller,
  //           core.psVault.address,
  //           signer,
  //           60 * 60 * 24 * 28,
  //           false
  //       );
  //       data.push([
  //         core.controller,
  //         data[1].address,
  //         lp_address,
  //         token0,
  //         token1,
  //         idx
  //       ]);
  //     } else {
  //       data = await DeployerUtils.deployAndInitVaultAndStrategy(
  //           vaultNameWithoutPrefix,
  //           vaultAddress => DeployerUtils.deployContract(
  //               signer,
  //               'StrategyWaultSingle',
  //               core.controller,
  //               vaultAddress,
  //               lp_address,
  //               idx
  //           ) as Promise<IStrategy>,
  //           core.controller,
  //           core.psVault.address,
  //           signer,
  //           60 * 60 * 24 * 28,
  //           false
  //       );
  //       data.push([
  //         core.controller,
  //         data[1].address,
  //         lp_address,
  //         token0,
  //         token1,
  //         idx
  //       ]);
  //     }
  //
  //     deployed.push(data);
  //   }
  //
  // });

  // it("check exist deployment", async () => {
  //   const core = await DeployerUtils.getCoreAddresses();
  //   const tools = await DeployerUtils.getToolsAddresses();
  //
  //   const cReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;
  //
  //   const info = await cReader.vaultWithUserInfos(signer.address, ['0x890Ab3306A67f8f8d1eB23b52681c84D9b2cEa41']);
  //   expect(info[0].vault.name).is.eq('TETU_QUICK_QUICK_PolyDoge');
  // });


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
