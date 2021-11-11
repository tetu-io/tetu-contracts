import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {config as dotEnvConfig} from "dotenv";
import {StrategyInfo} from "../../StrategyInfo";
import {TimeUtils} from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {ethers} from "hardhat";
import {IStrategy, PriceCalculator} from "../../../../typechain";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {TokenUtils} from "../../../TokenUtils";
import {utils} from "ethers";
import {DoHardWorkLoop} from "../../DoHardWorkLoop";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneWaultStrategyTest: {
      type: "number",
      default: 2,
    }
  }).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Dino pool tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  const underlying = MaticAddresses.DINO_TOKEN;
  const reward = MaticAddresses.DINO_TOKEN;

  let snapshotBefore: string;
  let snapshot: string;
  let strategyInfo: StrategyInfo;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    const signer = await DeployerUtils.impersonate();
    const user = (await ethers.getSigners())[1];

    // const core = await DeployerUtils.getCoreAddressesWrapper(signer);
    const core = await DeployerUtils.deployAllCoreContracts(signer);
    const tools = await DeployerUtils.getToolsAddresses();
    const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator

    const data = await StrategyTestUtils.deploy(
      signer,
      core,
      'DINO',
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        'StrategyDinoPool',
        core.controller.address,
        vaultAddress,
        underlying
      ) as Promise<IStrategy>,
      underlying
    );

    const vault = data[0];
    const strategy = data[1];
    const lpForTargetToken = data[2];

    for (const rt of [reward]) {
      await StrategyTestUtils.setConversionPath(rt, core.rewardToken.address, calculator, core.feeRewardForwarder);
      await StrategyTestUtils.setConversionPath(rt, MaticAddresses.USDC_TOKEN, calculator, core.feeRewardForwarder);
      if ((await strategy.buyBackRatio()).toNumber() !== 10000) {
        await StrategyTestUtils.setConversionPath(rt, underlying, calculator, core.feeRewardForwarder);
      }
    }

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

    const largest = (await calculator.getLargestPool(underlying, []));
    const tokenOpposite = largest[0];
    const tokenOppositeFactory = await calculator.swapFactories(largest[1]);
    console.log('largest', largest);

    // ************** add funds for investing ************
    const dec = await TokenUtils.decimals(underlying);
    await TokenUtils.getToken(underlying, user.address, utils.parseUnits('1000', dec));
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
      60 * 60
    );
  });


});
