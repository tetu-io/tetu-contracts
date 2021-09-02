import {ethers} from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {StrategyInfo} from "./StrategyInfo";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../MaticAddresses";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {UniswapUtils} from "../UniswapUtils";
import {Erc20Utils} from "../Erc20Utils";
import {DoHardWorkLoop} from "./DoHardWorkLoop";
import {utils} from "ethers";
import {IStrategy} from "../../typechain";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startIronFoldStrategyTest(
    strategyName: string,
    factory: string,
    underlying: string,
    tokenName: string,
    rewardTokens: string[],
    rToken: string,
    borrowTargetFactorNumerator: string,
    collateralFactorNumerator: string
) {

  describe(strategyName + " " + tokenName + "Test", async function () {
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;

    before(async function () {
      snapshotBefore = await TimeUtils.snapshot();
      const signer = (await ethers.getSigners())[0];
      const user = (await ethers.getSigners())[1];

      const core = await DeployerUtils.deployAllCoreContracts(signer, 60 * 60 * 24 * 28, 1);
      const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

      for (let rt of rewardTokens) {
        await core.feeRewardForwarder.setConversionPath(
            [rt, MaticAddresses.USDC_TOKEN, core.rewardToken.address],
            [MaticAddresses.getRouterByFactory(factory), MaticAddresses.QUICK_ROUTER]
        );
        await core.feeRewardForwarder.setConversionPath(
            [rt, MaticAddresses.USDC_TOKEN],
            [MaticAddresses.getRouterByFactory(factory)]
        );
      }


      const data = await StrategyTestUtils.deploy(
          signer,
          core,
          tokenName,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              strategyName,
              core.controller.address,
              vaultAddress,
              underlying,
              rToken,
              borrowTargetFactorNumerator,
              collateralFactorNumerator
          ) as Promise<IStrategy>,
          underlying
      );

      const vault = data[0];
      const strategy = data[1];
      const lpForTargetToken = data[2];

      strategyInfo = new StrategyInfo(
          underlying,
          signer,
          user,
          core,
          vault,
          strategy,
          lpForTargetToken,
          calculator
      );

      const largest = (await calculator.getLargestPool(underlying, []));
      const tokenOpposite = largest[0];
      const tokenOppositeFactory = await calculator.swapFactories(largest[1]);
      console.log('largest', largest);

      //************** add funds for investing ************
      const baseAmount = 10_000;
      await UniswapUtils.buyAllBigTokens(user);
      const name = await Erc20Utils.tokenSymbol(tokenOpposite);
      const dec = await Erc20Utils.decimals(tokenOpposite);
      const price = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(tokenOpposite)));
      console.log('tokenOpposite Price', price, name);
      const amountForSell = baseAmount / price;
      console.log('amountForSell', amountForSell);

      await UniswapUtils.buyToken(user, MaticAddresses.getRouterByFactory(tokenOppositeFactory),
          underlying, utils.parseUnits(amountForSell.toString(), dec), tokenOpposite);
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


    it("do hard work with liq path", async () => {
      await StrategyTestUtils.doHardWorkWithLiqPath(strategyInfo,
          (await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
          strategyInfo.strategy.readyToClaim
      );
    });
    it("emergency exit", async () => {
      await StrategyTestUtils.checkEmergencyExit(strategyInfo);
    });
    it("common test should be ok", async () => {
      await StrategyTestUtils.commonTests(strategyInfo);
    });
    it("doHardWork loop", async function () {
      await DoHardWorkLoop.doHardWorkLoop(
          strategyInfo,
          (await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
          5,
          60
      );
    });

  });
}

export {startIronFoldStrategyTest};
