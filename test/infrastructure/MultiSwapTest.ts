import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {
  IUniswapV2Pair,
  IUniswapV2Router02,
  MultiSwap,
  PriceCalculator,
  ZapIntoVault
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {Erc20Utils} from "../Erc20Utils";
import {MultiSwapUtils} from "../MultiSwapUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Multi swap tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;
  let zapIntoVault: ZapIntoVault;
  let multiSwap: MultiSwap;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);


    calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0] as PriceCalculator;
    multiSwap = await DeployerUtils.deployContract(signer, 'MultiSwap', core.controller.address, calculator.address) as MultiSwap;
    zapIntoVault = (await DeployerUtils.deployZapIntoVault(signer, core.controller.address))[0];

    await zapIntoVault.setMultiSwap(multiSwap.address);

    await multiSwap.setRouterForFactory(MaticAddresses.QUICK_FACTORY, MaticAddresses.QUICK_ROUTER);
    await multiSwap.setRouterForFactory(MaticAddresses.SUSHI_FACTORY, MaticAddresses.SUSHI_ROUTER);
    await multiSwap.setRouterForFactory(MaticAddresses.WAULT_FACTORY, MaticAddresses.WAULT_ROUTER);

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
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

  it("should swap tokens with route QI", async () => {
    await tryToSwap(signer, multiSwap, MaticAddresses.USDC_TOKEN, MaticAddresses.QI_TOKEN);
  });

  it("should swap tokens with route WEX", async () => {
    await tryToSwap(signer, multiSwap, MaticAddresses.USDC_TOKEN, MaticAddresses.WEXpoly_TOKEN);
  });


});

async function tryToSwap(signer: SignerWithAddress, multiSwap: MultiSwap, tokenIn: string, tokenOut: string) {

  const tokenInDec = await Erc20Utils.decimals(tokenIn);

  const amount = utils.parseUnits('1000', tokenInDec);

  expect(+utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec))
  .is.greaterThan(+utils.formatUnits(amount, tokenInDec));

  await MultiSwapUtils.multiSwap(signer, multiSwap, tokenIn, tokenOut, amount, 5);

  expect(await Erc20Utils.balanceOf(tokenOut, signer.address)).is.not.eq(0);
}
