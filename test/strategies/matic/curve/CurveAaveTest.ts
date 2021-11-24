import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
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


describe('Curve aave tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  let snapshotBefore: string;
  let snapshot: string;
  let strategyInfo: StrategyInfo;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    const [user, investor, ] = (await ethers.getSigners());
    const signer = await DeployerUtils.impersonate();
    // const core = await DeployerUtils.getCoreAddressesWrapper(signer);
    const core = await DeployerUtils.deployAllCoreContracts(signer);
    const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];
    const underlying = MaticAddresses.AM3CRV_TOKEN;
    const underlyingName = await TokenUtils.tokenSymbol(underlying);
    const strategyName = 'CurveAaveStrategy';

    const [vault, strategy, lpForTargetToken] = await StrategyTestUtils.deployStrategy(
        strategyName, signer, core, underlying, underlyingName);

    await StrategyTestUtils.initForwarder(core.feeRewardForwarder);

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

    // swap tokens to invest
    await CurveUtils.addLiquidityAave(investor);

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

  it("doHardWork with liq path", async () => {
    await CurveDoHardWorkLoop.doHardWorkWithLiqPath(strategyInfo, null);
  });

  it("doHardWork loop", async function () {
    await DoHardWorkLoop.doHardWorkLoop(
        strategyInfo,
        (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
        3,
      60 * 60
    );
  });

  it("emergency exit", async () => {
    await StrategyTestUtils.checkEmergencyExit(strategyInfo);
  });

  it("common test should be ok", async () => {
    await StrategyTestUtils.commonTests(strategyInfo);
  });

});
