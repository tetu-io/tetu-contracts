import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {PriceCalculator} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {Erc20Utils} from "../Erc20Utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Price calculator tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    core = await DeployerUtils.deployAllCoreContracts(signer);
    await core.mintHelper.startMinting();
    calculator = await DeployerUtils
    .deployPriceCalculatorMatic(signer, core.controller.address);
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


  it("calculate eth/usdc price and check", async () => {
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.WETH_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(100);
    expect(ethPrice).is.lessThan(100000);
  });

  it("calculate eth/eth price and check", async () => {
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.WETH_TOKEN, MaticAddresses.WETH_TOKEN);
    expect(ethPrice).is.eq(1);
  });
  it("calculate quick/usdc price and check", async () => {
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.QUICK_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(10);
    expect(ethPrice).is.lessThan(10000);
  });
  it("calculate quick/eth price and check", async () => {
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.QUICK_TOKEN, MaticAddresses.WETH_TOKEN);
    expect(ethPrice).is.greaterThan(0.01);
    expect(ethPrice).is.lessThan(10);
  });

  it("calculate prices", async () => {
    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.WETH_TOKEN, MaticAddresses.WETH_TOKEN);

    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.ADDY_TOKEN, MaticAddresses.USDC_TOKEN);

    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.ADDY_TOKEN, MaticAddresses.WETH_TOKEN);

    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.ADDY_TOKEN, MaticAddresses.WETH_TOKEN);

    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.SUSHI_WMATIC_WETH, MaticAddresses.USDC_TOKEN);

    await PriceCalculatorUtils.getFormattedPrice(calculator,
        MaticAddresses.QUICK_WMATIC_ETH, MaticAddresses.USDC_TOKEN);
  });

  it("remove key token", async () => {
    const size = (await calculator.keyTokensSize()).toNumber();
    console.log("size", size);
    const last = await calculator.keyTokens(size - 1);
    console.log("last", last);

    await calculator.removeKeyToken(last);

    const newSize = (await calculator.keyTokensSize()).toNumber();
    console.log('new size', newSize);
    const newLast = await calculator.keyTokens(newSize - 1);
    console.log('new last', newLast);
    expect(size - newSize).is.eq(1);
    expect(newLast).is.not.eq(last);
  });

  it("add key token", async () => {
    const size = (await calculator.keyTokensSize()).toNumber();
    console.log("size", size);
    const last = await calculator.keyTokens(size - 1);
    console.log("last", last);

    await calculator.addKeyToken(MaticAddresses.ZERO_ADDRESS);

    const newSize = (await calculator.keyTokensSize()).toNumber();
    console.log('new size', newSize);
    const newLast = await calculator.keyTokens(newSize - 1);
    console.log('new last', newLast);
    expect(newSize - size).is.eq(1);
    expect(newLast).is.not.eq(last);
    expect(newLast).is.eq(MaticAddresses.ZERO_ADDRESS);
  });

  it("remove factory token", async () => {
    const size = (await calculator.swapFactoriesSize()).toNumber();
    console.log("size", size);
    const last = await calculator.swapFactories(size - 1);
    const lastName = await calculator.swapLpNames(size - 1);
    console.log("last", last);
    console.log("last name", lastName);

    await calculator.removeSwapPlatform(last, lastName);

    const newSize = (await calculator.swapFactoriesSize()).toNumber();
    console.log('new size', newSize);
    const newLast = await calculator.swapFactories(newSize - 1);
    const newLastName = await calculator.swapLpNames(newSize - 1);
    console.log('new last', newLast);
    console.log('new last Name', newLastName);
    expect(size - newSize).is.eq(1);
    expect(newLast).is.not.eq(last);
    expect(newLastName).is.not.eq(lastName);
  });

  it("add factory token", async () => {
    const size = (await calculator.swapFactoriesSize()).toNumber();
    console.log("size", size);
    const last = await calculator.swapFactories(size - 1);
    const lastName = await calculator.swapLpNames(size - 1);
    console.log("last", last);
    console.log("last name", lastName);

    await calculator.addSwapPlatform(MaticAddresses.ZERO_ADDRESS, "test");

    const newSize = (await calculator.swapFactoriesSize()).toNumber();
    console.log('new size', newSize);
    const newLast = await calculator.swapFactories(newSize - 1);
    const newLastName = await calculator.swapLpNames(newSize - 1);
    console.log('new last', newLast);
    console.log('new last Name', newLastName);
    expect(newSize - size).is.eq(1);
    expect(newLast).is.not.eq(last);
    expect(newLastName).is.not.eq(lastName);
    expect(newLast).is.eq(MaticAddresses.ZERO_ADDRESS);
    expect(newLastName).is.eq("test");
  });

  it("largest pool for frax", async () => {
    const data = (await calculator.getLargestPool(MaticAddresses.FRAX_TOKEN, []));
    const tokenOpposite = data[0];
    const platformIdx = data[1];
    const lp = data[2];
    const factory = await calculator.swapFactories(platformIdx);
    console.log('tokenOpposite', await Erc20Utils.tokenSymbol(tokenOpposite));
    console.log('factory', factory);
    console.log('lp', lp);
    expect(tokenOpposite.toLowerCase()).is.eq(MaticAddresses.USDC_TOKEN.toLowerCase());
  });

});
