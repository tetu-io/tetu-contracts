import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {PriceCalculator, SmartVault, StrategyAaveFold} from "../../../../typechain";
import {ethers} from "hardhat";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {TimeUtils} from "../../../TimeUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";

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

    let vault: SmartVault;
    let strategy: StrategyAaveFold;
    let lpForTargetToken;

    // if (!idx || idx === 'idx' || collateralFactor === '0') {
    if (!idx || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    console.log('strat', idx, aTokenName);

    describe(tokenName + "Test", async function () {
      let snapshotBefore: string;
      let snapshot: string;
      const underlying = token;
      const aToken = aTokenAddress;
      const debtToken = "0x75c4d1fb84429023170086f06e682dcbbf537b7d";
      const deposit = "1"

      let user: SignerWithAddress;
      let core: CoreContractsWrapper;
      let calculator: PriceCalculator;

      before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        const signer = await DeployerUtils.impersonate();
        user = (await ethers.getSigners())[1];
        const undDec = await TokenUtils.decimals(underlying);

        core = await DeployerUtils.getCoreAddressesWrapper(signer);
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
        await TokenUtils.getToken(underlying, user.address, utils.parseUnits(deposit, undDec))
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

        const vaultForUser = vault.connect(user);
        const rt0 = (await vaultForUser.rewardTokens())[0];
        const userUnderlyingBalance = await TokenUtils.balanceOf(underlying, user.address);
        const undDec = await TokenUtils.decimals(underlying);

        await strategy.setFold(false);


        console.log("deposit", deposit);
        await VaultUtils.deposit(user, vault, utils.parseUnits(deposit, undDec));

        const rewardBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, user.address);
        console.log("rewardBalanceBefore: ", rewardBalanceBefore.toString());

        const vaultBalanceBefore = await TokenUtils.balanceOf(core.psVault.address, vault.address);
        console.log("vaultBalanceBefore: ", vaultBalanceBefore.toString());


        const underlyingBalanceBefore = await TokenUtils.balanceOf(aToken, strategy.address);
        console.log("underlyingBalanceBefore: ", underlyingBalanceBefore.toString());

        const debtBalanceBefore = await TokenUtils.balanceOf(debtToken, strategy.address);
        console.log("debtBalanceBefore: ", debtBalanceBefore.toString());

        const maticBefore = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, strategy.address);
        console.log("MATIC before: ", maticBefore.toString());
        await strategy.rewardPrediction(8640000);

        // await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30 * 12); // 1 year
        await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 100); //8640025
        await strategy.claimRewardPublic();
        // await strategy.doHardWork();

        // const vaultBalanceAfter = await TokenUtils.balanceOf(core.psVault.address, vault.address);
        //
        // expect(vaultBalanceAfter.sub(vaultBalanceBefore)).is.not.eq("0", "vault reward should increase");
        //

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
