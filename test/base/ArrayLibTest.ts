import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ArrayLibTest} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Array lib tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let arraylib: ArrayLibTest;
  let usdc: string;
  let tetu: string;
  let networkToken: string;
  const addresses: string[] = [];
  const uints = [1, 2, 3];
  const INDEX_OUT_OF_BOUND = "ArrayLib: Index out of bounds";
  const NOT_UNIQUE_ITEM = "ArrayLib: Not unique item";
  const ITEM_NOT_FOUND = "ArrayLib: Item not found";

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    arraylib = await DeployerUtils.deployContract(signer, "ArrayLibTest") as ArrayLibTest;
    usdc = await DeployerUtils.getUSDCAddress();
    tetu = await DeployerUtils.getTETUAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    addresses.push(usdc);
    addresses.push(networkToken)
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("contains test", async () => {
    expect(await arraylib.callStatic.containsUint(uints, 1)).is.equal(true);
    expect(await arraylib.callStatic.containsUint(uints, 5)).is.equal(false);
    expect(await arraylib.callStatic.containsAddress(addresses, usdc)).is.equal(true);
    expect(await arraylib.callStatic.containsAddress(addresses, tetu)).is.equal(false);
  });

  it("add unique test", async () => {
    const uintArray = await arraylib.callStatic.addUniqueUint(uints, 5);
    expect(await arraylib.callStatic.containsUint(uintArray, 5)).is.equal(true);
    await expect(arraylib.callStatic.addUniqueUint(uintArray, 1)).is.rejectedWith(NOT_UNIQUE_ITEM);
    const addressArray = await arraylib.callStatic.addUniqueAddress(addresses, tetu);
    expect(await arraylib.callStatic.containsAddress(addressArray, tetu)).is.equal(true);
    await expect(arraylib.callStatic.addUniqueAddress(addressArray, usdc)).is.rejectedWith(NOT_UNIQUE_ITEM);
  });

  it("add unique array test", async () => {
    const uintArray = await arraylib.callStatic.addUniqueArrayUint(uints, [5, 6]);
    expect(await arraylib.callStatic.containsUint(uintArray, 6)).is.equal(true);
    await expect(arraylib.callStatic.addUniqueArrayUint(uintArray, [1, 7])).is.rejectedWith(NOT_UNIQUE_ITEM);
    const addressArray = await arraylib.callStatic.addUniqueArrayAddress(addresses, [tetu]);
    expect(await arraylib.callStatic.containsUint(addressArray, tetu)).is.equal(true);
    await expect(arraylib.callStatic.addUniqueArrayUint(addressArray, [usdc]))
      .is.rejectedWith(NOT_UNIQUE_ITEM);
  });

  it("remove by index test", async () => {
    const uintArray = await arraylib.callStatic.removeByIndexUint(uints, 0, true);
    expect(await arraylib.callStatic.containsUint(uintArray, 1)).is.equal(false);
    await expect(arraylib.callStatic.removeByIndexUint(uintArray, 10, true))
      .is.rejectedWith(INDEX_OUT_OF_BOUND);
    const addressArray = await arraylib.callStatic.removeByIndexAddress(addresses, 0, true);
    expect(await arraylib.callStatic.containsAddress(addressArray, usdc)).is.equal(false);
    await expect(arraylib.callStatic.removeByIndexAddress(addressArray, 10, true))
        .is.rejectedWith(INDEX_OUT_OF_BOUND);
  });

  it("find and remove test", async () => {
    const uintArray = await arraylib.callStatic.findAndRemoveUint(uints, 1, false);
    expect(await arraylib.callStatic.containsUint(uintArray, 1)).is.equal(false);
    await expect(arraylib.callStatic.findAndRemoveUint(uintArray, 5, false))
      .is.rejectedWith(ITEM_NOT_FOUND);
    const addressArray = await arraylib.callStatic.findAndRemoveAddress(addresses, usdc, false);
    expect(await arraylib.callStatic.containsAddress(addressArray, usdc)).is.equal(false);
    await expect(arraylib.callStatic.findAndRemoveAddress(addressArray, tetu, false))
      .is.rejectedWith(ITEM_NOT_FOUND);
  });

  it("find and remove array test", async () => {
    const uintArray = await arraylib.callStatic.findAndRemoveArrayUint(uints, [1, 3], true);
    expect(await arraylib.callStatic.containsUint(uintArray, 3)).is.equal(false);
    await expect(arraylib.callStatic.findAndRemoveArrayUint(uintArray, [1, 5], false))
      .is.rejectedWith(ITEM_NOT_FOUND);
    const addressArray = await arraylib.callStatic.findAndRemoveArrayAddress(addresses, [usdc], true);
    expect(await arraylib.callStatic.containsAddress(addressArray, usdc)).is.equal(false);
    await expect(arraylib.callStatic.findAndRemoveArrayAddress(addressArray, [tetu], false))
      .is.rejectedWith(ITEM_NOT_FOUND);
  });

  it("sort array by int", async () => {
    const adrs = [
      '0x0000000000000000000000000000000000000000', // 5
      '0x0000000000000000000000000000000000000001', // 10
      '0x0000000000000000000000000000000000000002', // 0
      '0x0000000000000000000000000000000000000003', // 9
    ];
    const ints = [5, 10, 0, 9];
    const result = await arraylib.callStatic.sortAddressesByUint(adrs, ints);
    console.log(result);
    expect(result[0]).is.eq('0x0000000000000000000000000000000000000002');
    expect(result[1]).is.eq('0x0000000000000000000000000000000000000000');
    expect(result[2]).is.eq('0x0000000000000000000000000000000000000003');
    expect(result[3]).is.eq('0x0000000000000000000000000000000000000001');
  });

  it("sort array by int2", async () => {
    const adrs = [
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000001',
    ];
    const ints = [1000, 1];
    const result = await arraylib.callStatic.sortAddressesByUint(adrs, ints);
    console.log(result);
    expect(result[0]).is.eq('0x0000000000000000000000000000000000000001');
    expect(result[1]).is.eq('0x0000000000000000000000000000000000000000');
  });
  it("sort array by int2", async () => {
    const adrs = [
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000001',
    ];
    const ints = [0, 1];
    const result = await arraylib.callStatic.sortAddressesByUint(adrs, ints);
    console.log(result);
    expect(result[0]).is.eq('0x0000000000000000000000000000000000000000');
    expect(result[1]).is.eq('0x0000000000000000000000000000000000000001');
  });

  it("sort array by int reverted", async () => {
    const adrs = [
      '0x0000000000000000000000000000000000000000', // 5
      '0x0000000000000000000000000000000000000001', // 10
      '0x0000000000000000000000000000000000000002', // 0
      '0x0000000000000000000000000000000000000003', // 9
    ];
    const ints = [5, 10, 0, 9];
    const result = await arraylib.callStatic.sortAddressesByUintReverted(adrs, ints);
    console.log(result);
    expect(result[3]).is.eq('0x0000000000000000000000000000000000000002');
    expect(result[2]).is.eq('0x0000000000000000000000000000000000000000');
    expect(result[1]).is.eq('0x0000000000000000000000000000000000000003');
    expect(result[0]).is.eq('0x0000000000000000000000000000000000000001');
  });
});
