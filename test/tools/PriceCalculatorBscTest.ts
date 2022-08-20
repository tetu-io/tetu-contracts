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
import {Addresses} from "../../addresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Price calculator bsc tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let calculator: PriceCalculator;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(56))) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    const coreAdrs = await Addresses.CORE.get('56');
    calculator = (await DeployerUtils.deployPriceCalculator(signer, coreAdrs?.controller || ''))[0];
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

  it("cone/bnb price", async () => {
    if (!(await DeployerUtils.isNetwork(56))) {
      return;
    }
    const price = await PriceCalculatorUtils.getFormattedPrice(calculator,
      '0x672cD8201CEB518F9E42526ef7bCFe5263F41951', MaticAddresses.USDC_TOKEN);
    expect(price).is.greaterThan(0.1);
    expect(price).is.lessThan(1);
  });

});
