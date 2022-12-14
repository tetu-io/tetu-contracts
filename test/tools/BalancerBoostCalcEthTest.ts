import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {BalancerBoostCalculator} from "../../typechain";
import {formatUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("BalancerBoostCalcEthTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let calculator: BalancerBoostCalculator;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(1))) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    calculator = await DeployerUtils.deployContract(signer, 'BalancerBoostCalculator') as BalancerBoostCalculator;
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

  it("calc bbasud", async () => {
    await check(calculator, '0x5dc1c173587aa562179b03db9d643ff5ff2e4660');
  });

  it("calc reth-weth", async () => {
    await check(calculator, '0xc6f6e9772361a75988c6cc248a3945a870fb1272');
  });

});

async function check(calculator: BalancerBoostCalculator, vault: string) {
  if (!(await DeployerUtils.isNetwork(1))) {
    return;
  }
  const data = await calculator.getBalancerBoostInfo(vault);
  console.log('derivedBalanceBoost', formatUnits(data.derivedBalanceBoost))
  console.log('ableToBoost', formatUnits(data.ableToBoost))
  console.log('gaugeBalance', formatUnits(data.gaugeBalance));
}
