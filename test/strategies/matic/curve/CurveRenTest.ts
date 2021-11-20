import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {UniswapUtils} from "../../../UniswapUtils";
import {utils} from "ethers";
import {ethers} from "hardhat";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyInfo} from "../../StrategyInfo";
import {TimeUtils} from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {DoHardWorkLoop} from "../../DoHardWorkLoop";
import {CurveDoHardWorkLoop} from "./utils/CurveDoHardWorkLoop";
import {CurveUtils} from "./utils/CurveUtils";
import {config as dotEnvConfig} from "dotenv";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  },
}).argv;

chai.use(chaiAsPromised);

describe('Curve ren tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  let snapshotBefore: string;
  let snapshot: string;
  let strategyInfo: StrategyInfo;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    const [signer, investor, trader] = (await ethers.getSigners());
    const core = await DeployerUtils.deployAllCoreContracts(
        signer, 60 * 60 * 24 * 28, 1);
    const calculator = (await DeployerUtils.deployPriceCalculatorMatic(
        signer, core.controller.address))[0];

    const underlying = MaticAddresses.BTCCRV_TOKEN;

    const underlyingName = await TokenUtils.tokenSymbol(underlying);

    const strategyName = 'CurveRenStrategy';

    const [vault, strategy, lpForTargetToken] = await StrategyTestUtils.deployStrategy(
        strategyName, signer, core, underlying, underlyingName);

    for (const rt of [MaticAddresses.WMATIC_TOKEN, MaticAddresses.CRV_TOKEN]) {
      await StrategyTestUtils.setConversionPath(rt, core.rewardToken.address, calculator, core.feeRewardForwarder);
      await StrategyTestUtils.setConversionPath(rt, MaticAddresses.USDC_TOKEN, calculator, core.feeRewardForwarder);
      await StrategyTestUtils.setConversionPath(rt, MaticAddresses.WBTC_TOKEN, calculator, core.feeRewardForwarder);
    }

    strategyInfo = new StrategyInfo(
        underlying,
        signer,
        investor,
        core,
        vault,
        strategy,
        lpForTargetToken,
        calculator
    );

    await CurveUtils.addLiquidityRen(investor);

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

  it("doHardWork loop with liq path", async () => {
    await CurveDoHardWorkLoop.doHardWorkWithLiqPath(strategyInfo, null);
  });

  it("doHardWork loop", async function () {
    await DoHardWorkLoop.doHardWorkLoop(
        strategyInfo,
        (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
        3,
        27000
    );
  });

  it("emergency exit", async () => {
    await StrategyTestUtils.checkEmergencyExit(strategyInfo);
  });

  it("common test should be ok", async () => {
    await StrategyTestUtils.commonTests(strategyInfo);
  });


});
