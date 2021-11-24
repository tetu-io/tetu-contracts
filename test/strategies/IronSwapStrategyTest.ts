import {ethers} from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {StrategyInfo} from "./StrategyInfo";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../MaticAddresses";
import {StrategyTestUtils} from "./StrategyTestUtils";
import {UniswapUtils} from "../UniswapUtils";
import {TokenUtils} from "../TokenUtils";
import {DoHardWorkLoop} from "./DoHardWorkLoop";
import {utils} from "ethers";
import {IIronLpToken, IIronSwap, IStrategy} from "../../typechain";
import {VaultUtils} from "../VaultUtils";


const {expect} = chai;
chai.use(chaiAsPromised);

async function startIronSwapStrategyTest(
  strategyName: string,
  factory: string,
  underlying: string,
  tokens: string[],
  tokenNames: string,
  platformPoolIdentifier: string,
  rewardTokens: string[]
) {

  describe(strategyName + " " + tokenNames + " IronSwapTest", async function () {
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;

    before(async function () {
      snapshotBefore = await TimeUtils.snapshot();
      const signer = await DeployerUtils.impersonate();
      const user = (await ethers.getSigners())[1];

      // const core = await DeployerUtils.getCoreAddressesWrapper(signer);
      const core = await DeployerUtils.deployAllCoreContracts(signer);
      const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

      await StrategyTestUtils.initForwarder(core.feeRewardForwarder);

      const data = await StrategyTestUtils.deploy(
        signer,
        core,
        tokenNames,
        async vaultAddress => DeployerUtils.deployContract(
          signer,
          strategyName,
          core.controller.address,
          vaultAddress,
          underlying,
          tokens,
          platformPoolIdentifier
        ) as Promise<IStrategy>,
        underlying
      );

      const vault = data[0];
      const strategy = data[1];
      const lpForTargetToken = data[2];

      await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

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

      // ************** add funds for investing ************
      const baseAmount = 10_000;
      const targetTokenIdx = 1;
      const token = tokens[targetTokenIdx];


      // await UniswapUtils.buyAllBigTokens(user);
      const data0 = (await calculator.getLargestPool(token, []));
      const token0Opposite = data0[0];
      const token0OppositeFactory = await calculator.swapFactories(data0[1]);

      const name0 = await TokenUtils.tokenSymbol(token0Opposite);
      const dec0 = await TokenUtils.decimals(token0Opposite);
      const price0 = parseFloat(utils.formatUnits(await calculator.getPriceWithDefaultOutput(token0Opposite)));
      console.log('token0Opposite Price', price0, name0);
      const amountForSell0 = baseAmount / price0;


      await UniswapUtils.getTokenFromHolder(user, MaticAddresses.getRouterByFactory(token0OppositeFactory),
        token, utils.parseUnits(amountForSell0.toFixed(dec0), dec0), token0Opposite);


      // ************** add liq ************
      const amounts = [];
      for (const item of tokens) {
        amounts.push(0);
      }

      const lpCtr = await DeployerUtils.connectInterface(user, 'IIronLpToken', underlying) as IIronLpToken;
      const swapCtr = await DeployerUtils.connectInterface(user, 'IIronSwap', await lpCtr.swap()) as IIronSwap;

      const availBal = await TokenUtils.balanceOf(token, user.address);
      console.log('availBal', availBal.toString());
      // amounts[0]  = utils.parseUnits((baseAmount/10).toFixed(0), await Erc20Utils.decimals(token));
      amounts[targetTokenIdx] = availBal;
      await TokenUtils.approve(token, user, swapCtr.address, amounts[targetTokenIdx].toString());

      console.log('try to add liq to iron swap', amounts)
      await swapCtr.addLiquidity(amounts, 0, Date.now())


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
      await StrategyTestUtils.doHardWorkSimple(strategyInfo,
        (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
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
        (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
        3,
        60
      );
    });

  });
}

export {startIronSwapStrategyTest};
