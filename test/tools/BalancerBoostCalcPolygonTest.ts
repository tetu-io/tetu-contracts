import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {BalancerBoostCalculatorPolygon} from "../../typechain";
import {formatUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("BalancerBoostCalcPolygonTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let calculator: BalancerBoostCalculatorPolygon;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    calculator = await DeployerUtils.deployContract(signer, 'BalancerBoostCalculatorPolygon') as BalancerBoostCalculatorPolygon;
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

  it("calc stMATIC-WMATIC AAVE3", async () => {
    await check(calculator, '0x2f48c4b3a3d49d1e0f3a176ea8f558823b61a931');
  });

  it("calc xwstETH-WETH AAVE3", async () => {
    await check(calculator, '0xaa059efdd3f47814d7eea0df793ad7c70795e2c7');
  });

});

async function check(calculator: BalancerBoostCalculatorPolygon, vault: string) {
  if (!(await DeployerUtils.isNetwork(137))) {
    return;
  }
  const data = await calculator.getBalancerBoostInfo(vault);
  console.log('derivedBalanceBoost', formatUnits(data.derivedBalanceBoost))
  console.log('ableToBoost', formatUnits(data.ableToBoost))
  console.log('gaugeBalance', formatUnits(data.gaugeBalance));
}
