import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {HardWorkResolver, HardWorkResolver__factory} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {Misc} from "../../scripts/utils/tools/Misc";

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
    signer = await DeployerUtils.impersonate()

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    resolver = await DeployerUtils.deployContract(signer, "HardWorkResolver") as HardWorkResolver;
    await resolver.init(core.controller.address);

    await core.controller.addHardWorker(resolver.address)

    await resolver.setMaxGas(Misc.MAX_UINT);
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
    await resolver.setDelay(1)
  });

  it("setMaxGas", async () => {
    await resolver.setMaxGas(1)
  });

  it("setMaxHwPerCall", async () => {
    await resolver.setMaxHwPerCall(1)
  });

  it("changeOperatorStatus", async () => {
    await resolver.changeOperatorStatus(signer.address, true)
  });

  it("checker", async () => {
    const gas = (await resolver.estimateGas.checker()).toNumber()
    expect(gas).below(15_000_000);
    await resolver.checker();
  });

  it("execute call", async () => {
    await resolver.setMaxHwPerCall(3);
    await resolver.changeOperatorStatus(signer.address, true)
    const data = await resolver.checker();

    const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload).vaults
    console.log('vaults', vaults);

    const gas = (await resolver.estimateGas.call(vaults)).toNumber();
    expect(gas).below(15_000_000);

    const amountOfCalls = (await resolver.callStatic.call(vaults)).toNumber();
    expect(amountOfCalls).eq(3);

    await resolver.call(vaults)
  });

});
