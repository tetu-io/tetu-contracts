import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {PriceCalculatorV2} from "../../typechain";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";
import {BaseAddresses} from "../../scripts/addresses/BaseAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

const NETWORK = 8453;

describe("PriceCalculatorV2BaseTest", function () {
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
    calculator = await DeployerUtils.deployPriceCalculatorV2Base(signer);
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

  it.skip("calculate all prices", async () => {
    if (!(await DeployerUtils.isNetwork(NETWORK))) {return;}
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.WETH_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.TETU_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.USDbC_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.DAI_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.USDC_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.WELL_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.axlUSDC_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.crvUSD_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.CRV_TOKEN, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.TETU_tUSDbC_AERODROME_LP, BaseAddresses.USDbC_TOKEN);
    await PriceCalculatorUtils.getFormattedPrice(calculator, BaseAddresses.USDbC_tUSDbC_AERODROME_LP, BaseAddresses.USDbC_TOKEN);
  });


  it("tetu price", async () => {
    await checkPrice(calculator, BaseAddresses.TETU_TOKEN, 0.001, 1);
  });

  it("TETU_tUSDbC_AERODROME_LP price", async () => {
    await checkPrice(calculator, BaseAddresses.TETU_tUSDbC_AERODROME_LP, 0.001, 1);
  });

});


async function checkPrice(calculator: PriceCalculatorV2, token: string, minPrice: number, maxPrice: number) {
  if (!(await DeployerUtils.isNetwork(NETWORK))) {return;}
  const price = await PriceCalculatorUtils.getFormattedPrice(calculator, token, BaseAddresses.USDC_TOKEN);
  expect(price).is.greaterThan(minPrice);
  expect(price).is.lessThan(maxPrice);
}
