import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {PriceCalculatorV2} from "../../typechain";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {ZkevmAddresses} from "../../scripts/addresses/ZkevmAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

const NETWORK = 1101;

describe("PriceCalculatorV2ZkevmTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let calculator: PriceCalculatorV2;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(NETWORK))) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    calculator = await DeployerUtils.deployPriceCalculatorV2ZkEvm(signer);
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

  it("calculate all prices", async () => {
    if (!(await DeployerUtils.isNetwork(NETWORK))) {return;}
    await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.WETH_TOKEN, ZkevmAddresses.USDC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.TETU_TOKEN, ZkevmAddresses.USDC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.USDT_TOKEN, ZkevmAddresses.USDC_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.DAI_TOKEN, ZkevmAddresses.USDC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.USDC_TOKEN, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.WELL_TOKEN, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.axlUSDC_TOKEN, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.crvUSD_TOKEN, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.CRV_TOKEN, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.TETU_tUSDbC_AERODROME_LP, ZkevmAddresses.USDT_TOKEN);
    // await PriceCalculatorUtils.getFormattedPrice(calculator, ZkevmAddresses.USDbC_tUSDbC_AERODROME_LP, ZkevmAddresses.USDT_TOKEN);
  });


  it("tetu price", async () => {
    await checkPrice(calculator, ZkevmAddresses.TETU_TOKEN, 0.001, 1);
  });

  // it("TETU_tUSDbC_AERODROME_LP price", async () => {
  //   await checkPrice(calculator, ZkevmAddresses.TETU_tUSDbC_AERODROME_LP, 1000, 1000000);
  // });

});


async function checkPrice(calculator: PriceCalculatorV2, token: string, minPrice: number, maxPrice: number) {
  if (!(await DeployerUtils.isNetwork(NETWORK))) {return;}
  const price = await PriceCalculatorUtils.getFormattedPrice(calculator, token, ZkevmAddresses.USDC_TOKEN);
  expect(price).is.greaterThan(minPrice);
  expect(price).is.lessThan(maxPrice);
}
