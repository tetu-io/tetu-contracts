import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../../TimeUtils";
import {ethers} from "hardhat";
import {MockHelpers} from "../helpers/MockHelpers";
import {
  MockController,
  MockStrategy,
  MockToken,
  StrategySplitter
} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {expect} from "chai";
import {loadFixture} from "ethereum-waffle";

describe("StrategySplitterTest", () => {
//region Constants
  const BLOCKS_PER_DAY = 6456;
//endregion Constants

//region Global vars for all tests
  let snapshot: string;
  let snapshotLocal: string;
  let deployer: SignerWithAddress;

  let controller: MockController;
  let vault: string;
  let underlying: MockToken;
  let splitter: StrategySplitter;

//endregion Global vars for all tests

//region before, after
  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    const signers = await ethers.getSigners();
    deployer = signers[0];

    controller = await MockHelpers.deployMockController(deployer);
    vault = ethers.Wallet.createRandom().address;
    underlying = await MockHelpers.deployMockTokens(deployer);

    await controller.setHardWorker(deployer.address);
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });
//endregion before, after

//region Initialization
  interface ICore {
    splitter: StrategySplitter;
    strategies: MockStrategy[];
  }
  async function createCore(countStrategies: number = 1): Promise<ICore> {
    splitter = await MockHelpers.deployStrategySplitter(deployer);
    const splitterAsController = splitter.connect(await DeployerUtils.impersonate(controller.address));
    await splitterAsController.initialize(controller.address, underlying.address, vault);

    const strategies: MockStrategy[] = [];
    for (let i = 0; i < countStrategies; ++i) {
      const strategy =await MockHelpers.deployMockStrategy(deployer);
      strategies.push(strategy);
      await strategy.setUnderlying(underlying.address);
      await splitterAsController.addStrategy(strategy.address);
    }

    return {splitter, strategies};
  }
//endregion Initialization

//region Unit tests
  describe("withdrawToVault", () => {
    interface IStrategyParams {
      investedBalance: string;
      withdrawAllToVaultAmount?: string;
    }
    interface IWithdrawToVaultTestParams {
      amount: string;
      splitterBalance: string;
      strategies: IStrategyParams[];
    }
    interface IWithdrawToVaultTestResults {
      vaultBalance: number;
      splitterBalance: number;
      strategyBalances: number[];
    }
    async function withdrawToVaultBase(p: IWithdrawToVaultTestParams): Promise<IWithdrawToVaultTestResults> {
      const decimals = await underlying.decimals();
      const core = await createCore(p.strategies.length);
      if (p.strategies) {
        for (let i = 0; i < p.strategies.length; ++i) {
          const strategy = core.strategies[i];
          const sp = p.strategies[i];
          await strategy.setInvestedUnderlyingBalance(parseUnits(sp.investedBalance, decimals));
          await underlying.mint(strategy.address, parseUnits(sp.investedBalance, decimals));
          await strategy.setWithdrawToVault(core.splitter.address);
          if (sp.withdrawAllToVaultAmount) {
            await strategy.setWithdrawAllToVault(core.splitter.address, parseUnits(sp.withdrawAllToVaultAmount, decimals));
          }
        }
      }
      await underlying.mint(splitter.address, parseUnits(p.splitterBalance, decimals));

      await core.splitter.withdrawToVault(parseUnits(p.amount, decimals));

      return {
        splitterBalance: +formatUnits(await underlying.balanceOf(core.splitter.address), decimals),
        vaultBalance: +formatUnits(await underlying.balanceOf(vault), decimals),
        strategyBalances: await Promise.all(core.strategies.map(
          async strategy => +formatUnits(await underlying.balanceOf(strategy.address), decimals)
        ))
      }
    }

    describe("Good paths", () => {
      describe("total balance of all strategies < amount", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "1000",
            splitterBalance: "500",
            strategies: [
              {investedBalance: "300", withdrawAllToVaultAmount: "300"}
            ]
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(800);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
        it("should return zero strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[0]).eq(0);
        });
      });
      describe("Balance of first strategy < amount < total balance of all strategies", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "1000",
            splitterBalance: "500",
            strategies: [
              {investedBalance: "300", withdrawAllToVaultAmount: "300"},
              {investedBalance: "400", withdrawAllToVaultAmount: "400"}
            ]
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(1000);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
        it("should return zero first strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[0]).eq(0);
        });
        it("should return expected second strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[1]).eq(200);
        });
      });
      describe("amount < balance of first strategy", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "200",
            splitterBalance: "50",
            strategies: [
              {investedBalance: "300", withdrawAllToVaultAmount: "300"},
            ]
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(200);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
        it("should return zero first strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[0]).eq(150);
        });
      });
      describe("amount == sum of balances of first and second strategies", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "70",
            splitterBalance: "30",
            strategies: [
              {investedBalance: "10", withdrawAllToVaultAmount: "10"},
              {investedBalance: "30", withdrawAllToVaultAmount: "30"},
              {investedBalance: "40", withdrawAllToVaultAmount: "40"},
            ]
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(70);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
        it("should return zero first strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[0]).eq(0);
        });
        it("should return zero second strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[1]).eq(0);
        });
        it("should return unchanged third strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[2]).eq(40);
        });
      });
      describe("amount < balance of the splitter", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "200",
            splitterBalance: "250",
            strategies: []
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(250);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
      });
      describe("needToWithdraw == _MIN_OP", () => {
        before(async function () {
          snapshotLocal = await TimeUtils.snapshot();
        });
        after(async function () {
          await TimeUtils.rollback(snapshotLocal);
        });
        async function withdrawToVaultFixture(): Promise<IWithdrawToVaultTestResults> {
          return withdrawToVaultBase({
            amount: "200",
            splitterBalance: "0",
            strategies: [
              // we assume here, that MIN_OP = 1 token
              {investedBalance: "199.999999", withdrawAllToVaultAmount: "199.999999"}, // 200,000000 - 199,999999 = 1 == MIN_OP
              {investedBalance: "1000", withdrawAllToVaultAmount: "1000"},
            ]
          });
        }
        it("should return expected vault balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.vaultBalance).eq(199.999999);
        });
        it("should return zero splitter balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.splitterBalance).eq(0);
        });
        it("should return zero first strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[0]).eq(0);
        });
        it("should return unchanged second strategy balance", async () => {
          const ret = await loadFixture(withdrawToVaultFixture);
          expect(ret.strategyBalances[1]).eq(1000);
        });
      });
    });
  });


//endregion Unit tests
});