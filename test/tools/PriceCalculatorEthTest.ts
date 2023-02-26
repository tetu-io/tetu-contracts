import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {PriceCalculator} from "../../typechain";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {Addresses} from "../../addresses";
import {BscAddresses} from "../../scripts/addresses/BscAddresses";
import {EthAddresses} from "../../scripts/addresses/EthAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Price calculator eth tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let calculator: PriceCalculator;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    const coreAdrs = await DeployerUtils.getCoreAddresses();
    calculator = (await DeployerUtils.deployPriceCalculator(signer, coreAdrs.controller))[0];
    await calculator.setTetuLiquidator('0x90351d15F036289BE9b1fd4Cb0e2EeC63a9fF9b0')
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

  it("tetuBal price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0xfe700d523094cc6c673d78f1446ae0743c89586e', EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.1);
    expect(price).is.lessThan(100);
  });

  it("wUSDR-USDC bpt price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x831261f44931b7da8ba0dcc547223c60bb75b47f', EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.1);
    expect(price).is.lessThan(100);
  });

  it("wstETH_WETH_BPT price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      EthAddresses.BALANCER_wstETH_WETH, EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(100);
    expect(price).is.lessThan(10000);
  });

  it("wstETH price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(100);
    expect(price).is.lessThan(100000);
  });

  it("WBTC price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      EthAddresses.WBTC_TOKEN, EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(100);
    expect(price).is.lessThan(100000);
  });

  it("WETH price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      EthAddresses.WETH_TOKEN, EthAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(100);
    expect(price).is.lessThan(100000);
  });

  it("bbaUSD-wstETH_BPT price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x25Accb7943Fd73Dda5E23bA6329085a3C24bfb6a', EthAddresses.USDC_TOKEN);
    console.log('price', price)
    expect(price).is.greaterThan(10);
    expect(price).is.lessThan(100);
  });

  it("bb-a-USDT_BPT price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x2f4eb100552ef93840d5adc30560e5513dfffacb', EthAddresses.USDC_TOKEN);
    console.log('price', price)
    expect(price).is.greaterThan(0.5);
    expect(price).is.lessThan(2);
  });

  it("bb-a-USD_BPT price", async () => {
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0xa13a9247ea42d743238089903570127dda72fe44', EthAddresses.USDC_TOKEN);
    console.log('price', price)
    expect(price).is.greaterThan(0.5);
    expect(price).is.lessThan(2);
  });

});
