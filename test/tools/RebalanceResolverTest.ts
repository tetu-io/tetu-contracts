import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {
  HardWorkResolver,
  HardWorkResolver__factory,
  RebalanceResolver,
  RebalanceResolver__factory
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {formatUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("RebalanceResolverTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;

  let core: CoreContractsWrapper;
  let resolver: RebalanceResolver;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    signer = await DeployerUtils.impersonate()

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    resolver = await DeployerUtils.deployContract(signer, "RebalanceResolver") as RebalanceResolver;
    await resolver.init(core.controller.address);

    await core.controller.addHardWorker(resolver.address)

    await resolver.setMaxGas(5000_000_000_000);
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

  it("setMaxGas", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.setMaxGas(1)
  });

  it("changeOperatorStatus", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.changeOperatorStatus(signer.address, true)
  });

  it("maxGasAdjusted", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    for (let i = 0; i < 30; i++) {
      const gas = formatUnits(await resolver.maxGasAdjusted(), 9);
      console.log(i, gas);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    }
  });

  it("checker", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    const gas = (await resolver.estimateGas.checker()).toNumber()
    expect(gas).below(15_000_000);
    await resolver.checker();
  });

  it("execute call", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.changeOperatorStatus(signer.address, true)


    for (let i = 0; i < 1; i++) {
      const data = await resolver.checker();
      console.log('run', i, data.canExec, data.execPayload);
      if (data.canExec) {
        const vault = RebalanceResolver__factory.createInterface().decodeFunctionData('call', data.execPayload).vault

        const lastHw = (await resolver.lastCall(vault)).toNumber();
        console.log(vault, lastHw);

        const gas = (await resolver.estimateGas.call(vault)).toNumber();
        expect(gas).below(15_000_000);

        await resolver.call(vault)
      } else {
        console.log('can not exec');
      }
    }
  });

});
