import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {HardWorkResolver, HardWorkResolver__factory} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {formatUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("HardWorkResolverTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;

  let core: CoreContractsWrapper;
  let resolver: HardWorkResolver;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    signer = await DeployerUtils.impersonate()

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    resolver = await DeployerUtils.deployContract(signer, "HardWorkResolver") as HardWorkResolver;
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

  it("setDelay", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.setDelay(1)
  });

  it("setMaxGas", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.setMaxGas(1)
  });

  it("setMaxHwPerCall", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }
    await resolver.setMaxHwPerCall(1)
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
    await resolver.setMaxHwPerCall(1);
    await resolver.changeOperatorStatus(signer.address, true)


    for (let i = 0; i < 1; i++) {
      const data = await resolver.checker();
      console.log('run', i, data.canExec, data.execPayload);
      if (data.canExec) {
        const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload).vaults

        for (const vault of vaults) {
          const lastHw = (await resolver.lastHW(vault)).toNumber();
          console.log(vault, lastHw);
        }


        const gas = (await resolver.estimateGas.call(vaults)).toNumber();
        expect(gas).below(15_000_000);

        const amountOfCalls = (await resolver.callStatic.call(vaults)).toNumber();
        expect(amountOfCalls).eq(1);

        await resolver.call(vaults)
      } else {
        console.log('can not exec');
      }
    }
  });

});
