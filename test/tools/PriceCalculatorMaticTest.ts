import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {PriceCalculator} from "../../typechain";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Price calculator matic tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    core = await DeployerUtils.getCoreAddressesWrapper(signer);
    calculator = (await DeployerUtils.deployPriceCalculator(signer, core.controller.address))[0];
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.WETH_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(100);
    expect(ethPrice).is.lessThan(100000);
  });

  it("calculate eth/eth price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.WETH_TOKEN, MaticAddresses.WETH_TOKEN);
    expect(ethPrice).is.eq(1);
  });
  it("calculate quick/usdc price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.QUICK_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(10);
    expect(ethPrice).is.lessThan(10000);
  });
  it("calculate quick/eth price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.QUICK_TOKEN, MaticAddresses.WETH_TOKEN);
    expect(ethPrice).is.greaterThan(0.01);
    expect(ethPrice).is.lessThan(10);
  });

  it("calculate aTricrypto3 - usdc price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.USD_BTC_ETH_CRV_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(10);
    expect(ethPrice).is.lessThan(10000);
  });

  it("calculate crvAave - usdc price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await calculator.setReplacementTokens(MaticAddresses.AM3CRV_TOKEN, MaticAddresses.WBTC_TOKEN);
    const ethPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.AM3CRV_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(ethPrice).is.greaterThan(30000);
    expect(ethPrice).is.lessThan(300000);
  });

  it("calculate prices", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
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
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const data = (await calculator.getLargestPool(MaticAddresses.FRAX_TOKEN, []));
    const tokenOpposite = data[0];
    const platformIdx = data[1];
    const lp = data[2];
    const factory = await calculator.swapFactories(platformIdx);
    console.log('tokenOpposite', await TokenUtils.tokenSymbol(tokenOpposite));
    console.log('factory', factory);
    console.log('lp', lp);
    expect(tokenOpposite.toLowerCase()).is.eq(MaticAddresses.USDC_TOKEN.toLowerCase());
  });

  it("calculate BTCCRV_TOKEN price", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const tokenPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.BTCCRV_TOKEN, MaticAddresses.USDC_TOKEN);
    const expectedTokenPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.WBTC_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(expectedTokenPrice === tokenPrice, "BTCCRV_TOKEN token price should be equal WBTC_TOKEN token price")
  });

  it("calculate AM3CRV_TOKEN price", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const tokenPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.AM3CRV_TOKEN, MaticAddresses.USDC_TOKEN);
    const expectedTokenPrice = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.USDC_TOKEN, MaticAddresses.USDC_TOKEN);
    expect(expectedTokenPrice === tokenPrice, "AM3CRV_TOKEN token price should be equal USDC_TOKEN token price")
  });

  it("calculate IRON_USDC_USDT_DAI, price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.IRON_IS3USD, MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.99);
    expect(price).is.lessThan(1.01);
  });

  it("calculate FIREBIRD eth-ice, price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.FIREBIRD_ETH_ICE, MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(1);
    expect(price).is.lessThan(500);
  });

  it("calculate DFYN usdc-ice, price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.DFYN_USDC_ICE, MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(50000);
    expect(price).is.lessThan(500000);
  });

  it("calculate IRON_IRON_IS3USD, price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      MaticAddresses.IRON_IRON_IS3USD, MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.99);
    expect(price).is.lessThan(1.01);
  });

  it("calculate tetu-swap-wmatic-tetu price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0xBe527f95815f906625F29fc084bFd783F4d00787', MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.1);
    expect(price).is.lessThan(1);
  });

  it("calculate VAULT tetu-swap-qi-tetuQi price and check", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x2F45a8A14237CA2d965405957f8C2A1082558890', MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.1);
    expect(price).is.lessThan(100);
  });

});
