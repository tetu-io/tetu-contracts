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

});
