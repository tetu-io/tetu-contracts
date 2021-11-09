import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {startIronFoldStrategyTest} from "../../IronFoldStrategyTest";
import {config as dotEnvConfig} from "dotenv";
import {startAaveFoldStrategyTest} from "./AaveFoldStrategyTest";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {
  IAaveProtocolDataProvider,
  IAToken,
  IStrategy,
  PriceCalculator,
  SmartVault,
  StrategyAaveFold
} from "../../../../typechain";
import {ethers} from "hardhat";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {TimeUtils} from "../../../TimeUtils";
import {StrategyInfo} from "../../StrategyInfo";
import {UniswapUtils} from "../../../UniswapUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {WMATIC} from "../../../../typechain/WMATIC";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneAaveFoldStrategyTest: {
      type: "number",
      default: 0,
    }
  }).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Aave Fold tests', async () => {

  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const aTokenName = strat[1];
    const aTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    // const collateralFactor = strat[5];
    // const borrowTarget = strat[6];

    const collateralFactor = '6000'; //todo add real data
    const borrowTarget = '5000';   //todo add real data

    let vault: SmartVault;
    let strategy: StrategyAaveFold;
    let lpForTargetToken;

    // if (!idx || idx === 'idx' || collateralFactor === '0') {
    if (!idx || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    // if (argv.onlyOneAaveFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneAaveFoldStrategyTest) {
    //   return;
    // }

    console.log('strat', idx, aTokenName);

    describe(tokenName + "Test", async function () {
      let snapshotBefore: string;
      let snapshot: string;
      let strategyInfo: StrategyInfo;
      let underlying = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
      let aToken = "0x27F8D03b3a2196956ED754baDc28D73be8830A6e";
      let debtToken = "0x75c4d1fb84429023170086f06e682dcbbf537b7d";

      let user: SignerWithAddress;
      let core:CoreContractsWrapper;
      let calculator: PriceCalculator;

      before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        const signer = (await ethers.getSigners())[0];
        user = (await ethers.getSigners())[1];

        core = await DeployerUtils.deployAllCoreContracts(signer, 60 * 60 * 24 * 28, 1);
        calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

        const data = await StrategyTestUtils.deploy(
          signer,
          core,
          tokenName,
          async vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyAaveFold',
            core.controller.address,
            vaultAddress,
            underlying,
            aToken,
            "5000",
            "6000"
          ) as Promise<StrategyAaveFold>,
          underlying
        );

        vault = data[0];
        strategy = data[1] as StrategyAaveFold;
        lpForTargetToken = data[2];

        await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

        await core.vaultController.changePpfsDecreasePermissions([vault.address], true);
        // ************** add funds for investing ************
        const baseAmount = 100_000;
        await UniswapUtils.buyAllBigTokens(user);
        console.log('############## Preparations completed ##################');
      });

      beforeEach(async function () {
        snapshot = await TimeUtils.snapshot();
      });

      afterEach(async function () {
        await TimeUtils.rollback(snapshot);
      });

      after(async function () {
        await TimeUtils.rollback(snapshotBefore);
      });

      it("Folding profitability calculations", async () => {
        const deposit = "1000000000000000000000"
        const vaultForUser = vault.connect(user);
        const rt0 = (await vaultForUser.rewardTokens())[0];
        const userUnderlyingBalance = await TokenUtils.balanceOf(underlying, user.address);

        await strategy.setFold(false);

        const undDec = await TokenUtils.decimals(underlying);
        console.log("deposit", deposit);
        await VaultUtils.deposit(user, vault, BigNumber.from(deposit));

        const rewardBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, user.address);
        console.log("rewardBalanceBefore: ", rewardBalanceBefore.toString());

        const vaultBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, vault.address);
        console.log("vaultBalanceBefore: ", vaultBalanceBefore.toString());


        const underlyingBalanceBefore = await TokenUtils.balanceOf(aToken, strategy.address);
        console.log("underlyingBalanceBefore: ", underlyingBalanceBefore.toString());

        const debtBalanceBefore = await TokenUtils.balanceOf(debtToken, strategy.address);
        console.log("debtBalanceBefore: ", debtBalanceBefore.toString());

        const matic_before = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address);
        console.log("MATIC before: ", matic_before.toString());

        // await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30 * 12); // 1 year
        await TimeUtils.advanceBlocksOnTs(100); // 1 h



        await strategy.claimRewardPublic();


        const underlyingBalanceAfter = await TokenUtils.balanceOf(aToken, strategy.address);
        console.log("underlyingBalanceAfter: ", underlyingBalanceAfter.toString());

        const debtBalanceAfter = await TokenUtils.balanceOf(debtToken, strategy.address);
        console.log("debtBalanceAfter: ", debtBalanceAfter.toString());

        const debtCost = debtBalanceAfter.sub(debtBalanceBefore);
        console.log("debtCost: ", debtCost.toString());

        const earned = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address);
        console.log("MATIC earned: ", earned.toString());
        console.log("DAI earned: ", underlyingBalanceAfter.sub(underlyingBalanceBefore).sub(debtCost).toString());


      });

    });


  });
});
