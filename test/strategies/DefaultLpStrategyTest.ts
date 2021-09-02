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
import {IStrategy, IUniswapV2Pair} from "../../typechain";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startDefaultLpStrategyTest(
    strategyName: string,
    factoryForLiquidation: string,
    underlying: string,
    token0: string,
    token0Name: string,
    token1: string,
    token1Name: string,
    platformPoolIdentifier: string,
    rewardTokens: string[]
) {

  describe(strategyName + " " + token0Name + " " + token1Name + " LpTest", async function () {
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
            [MaticAddresses.getRouterByFactory(factoryForLiquidation), MaticAddresses.QUICK_ROUTER]
        );

        await core.feeRewardForwarder.setConversionPath(
            [rt, MaticAddresses.USDC_TOKEN],
            [MaticAddresses.getRouterByFactory(factoryForLiquidation)]
        );
      }


      const data = await StrategyTestUtils.deploy(
          signer,
          core,
          token0Name + "_" + token1Name,
          vaultAddress => DeployerUtils.deployContract(
              signer,
              strategyName,
              core.controller.address,
              vaultAddress,
              underlying,
              token0,
              token1,
              platformPoolIdentifier
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

      const data0 = (await calculator.getLargestPool(token0, []));
      const token0Opposite = data0[0];
      const token0OppositeFactory = await calculator.swapFactories(data0[1]);

      const data1 = (await calculator.getLargestPool(token1, []));
      const token1Opposite = data1[0];
      const token1OppositeFactory = await calculator.swapFactories(data1[1])


      //************** add funds for investing ************
      const baseAmount = 10_000;
      await UniswapUtils.buyAllBigTokens(user);
      const name0 = await Erc20Utils.tokenSymbol(token0Opposite);
      const name1 = await Erc20Utils.tokenSymbol(token1Opposite);
      const dec0 = await Erc20Utils.decimals(token0Opposite);
      const dec1 = await Erc20Utils.decimals(token1Opposite);
      const price0 = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(token0Opposite)));
      console.log('token0Opposite Price', price0, name0);
      const price1 = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(token1Opposite)));
      console.log('token1Opposite Price', price1, name1);
      const amountForSell0 = baseAmount / price0;
      const amountForSell1 = baseAmount / price1;
      console.log('amountForSell0', amountForSell0, 'amountForSell1', amountForSell1);

      const pair = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', underlying) as IUniswapV2Pair;


      await UniswapUtils.buyTokensAndAddLiq(
          user,
          token0OppositeFactory,
          token1OppositeFactory,
          await pair.factory(),
          token0,
          token0Opposite,
          token1,
          token1Opposite,
          utils.parseUnits(amountForSell0.toFixed(dec0), dec0),
          utils.parseUnits(amountForSell1.toFixed(dec1), dec1)
      );
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


    // it("do hard work without liq path", async () => {
    //   await StrategyTestUtils.doHardWorkWithoutLiqPath(strategyInfo,
    //       (await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString());
    // });
    it("do hard work with liq path", async () => {
      await StrategyTestUtils.doHardWorkWithLiqPath(strategyInfo,
          (await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString()
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
          3,
          60
      );
    });

  });
}

export {startDefaultLpStrategyTest};
