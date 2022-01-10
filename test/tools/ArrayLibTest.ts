import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ContractUtils, ArrayLibTest} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Array lib tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let util: ContractUtils;
  let arraylib: ArrayLibTest;
  const addresses: string[] = [];

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    util = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;
    arraylib = await DeployerUtils.deployContract(signer, "ArrayLibTest") as ArrayLibTest;
    addresses.push(await DeployerUtils.getUSDCAddress())
    addresses.push(await DeployerUtils.getNetworkTokenAddress())
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("contains test", async () => {
    expect(await arraylib.callStatic.containsUint([1, 2, 3], 1)).is.equal(true);
    expect(await arraylib.callStatic.containsUint([1, 2, 3], 5)).is.equal(false);
    expect(await arraylib.callStatic.containsAddress(addresses, await DeployerUtils.getUSDCAddress())).is.equal(true);
    expect(await arraylib.callStatic.containsAddress(addresses, await DeployerUtils.getTETUAddress())).is.equal(false);
  });

});