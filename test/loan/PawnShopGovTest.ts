import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TetuPawnShop} from "../../typechain";
import {utils} from "ethers";
import {Misc} from "../../scripts/utils/tools/Misc";
import {parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu pawnshop gov tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let shop: TetuPawnShop;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    shop = await DeployerUtils.deployContract(signer, 'TetuPawnShop', signer.address, Misc.ZERO_ADDRESS,parseUnits('1000'), signer.address,) as TetuPawnShop;
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });


  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("Change governance", async () => {
    const currentTime = await TimeUtils.getBlockTime();
    expect((await shop.owner()).toLowerCase()).is.eq(signer.address.toLowerCase());

    await shop.announceGovernanceAction(0, usdc, 0)

    let tl = await shop.timeLocks(0);
    expect(tl.time.toNumber()).is.approximately(currentTime + 60 * 60 * 48, 60);
    expect(tl.addressValue.toLowerCase()).is.eq(usdc);
    expect(tl.uintValue).is.eq(0);

    await expect(shop.setOwner(networkToken)).revertedWith("TPS: Time Lock");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(shop.setOwner(networkToken)).revertedWith("TPS: Wrong address value");

    await shop.setOwner(usdc);

    tl = await shop.timeLocks(0);
    expect(tl.time.toNumber()).is.eq(0);
    expect(tl.addressValue).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(0);

    expect((await shop.owner()).toLowerCase()).is.eq(usdc);
  });

  it("Change fee recipient", async () => {
    const currentTime = await TimeUtils.getBlockTime();
    expect((await shop.feeRecipient()).toLowerCase()).is.eq(signer.address.toLowerCase());

    await shop.announceGovernanceAction(1, usdc, 0)

    let tl = await shop.timeLocks(1);
    expect(tl.time.toNumber()).is.approximately(currentTime + 60 * 60 * 48, 60);
    expect(tl.addressValue.toLowerCase()).is.eq(usdc);
    expect(tl.uintValue).is.eq(0);

    await expect(shop.setFeeRecipient(networkToken)).revertedWith("TPS: Time Lock");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(shop.setFeeRecipient(networkToken)).revertedWith("TPS: Wrong address value");

    await shop.setFeeRecipient(usdc);

    tl = await shop.timeLocks(1);
    expect(tl.time.toNumber()).is.eq(0);
    expect(tl.addressValue).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(0);

    expect((await shop.feeRecipient()).toLowerCase()).is.eq(usdc);
  });

  it("Change platform fee", async () => {
    const id = 2;
    const currentTime = await TimeUtils.getBlockTime();
    expect((await shop.platformFee()).toNumber()).is.eq(100);

    await shop.announceGovernanceAction(id, Misc.ZERO_ADDRESS, 200)

    let tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.approximately(currentTime + 60 * 60 * 48, 60);
    expect(tl.addressValue.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(200);

    await expect(shop.setPlatformFee(networkToken)).revertedWith("TPS: Time Lock");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(shop.setPlatformFee(211)).revertedWith("TPS: Wrong uint value");

    await shop.setPlatformFee(200);

    tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.eq(0);
    expect(tl.addressValue).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(0);

    expect((await shop.platformFee()).toNumber()).is.eq(200);
  });

  it("Change deposit amount", async () => {
    const id = 3;
    const value = utils.parseUnits('1000')
    const currentTime = await TimeUtils.getBlockTime();
    expect((await shop.positionDepositAmount())).is.eq(value);

    await shop.announceGovernanceAction(id, Misc.ZERO_ADDRESS, value)

    let tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.approximately(currentTime + 60 * 60 * 48, 60);
    expect(tl.addressValue.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(value);

    await expect(shop.setPositionDepositAmount(networkToken)).revertedWith("TPS: Time Lock");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(shop.setPositionDepositAmount(211)).revertedWith("TPS: Wrong uint value");

    await shop.setPositionDepositAmount(value);

    tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.eq(0);
    expect(tl.addressValue).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(0);

    expect((await shop.positionDepositAmount())).is.eq(value);
  });

  it("Change deposit token", async () => {
    const id = 4;
    const currentTime = await TimeUtils.getBlockTime();
    expect((await shop.positionDepositToken()).toLowerCase()).is.eq(Misc.ZERO_ADDRESS);

    await shop.announceGovernanceAction(id, usdc, 0)

    let tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.approximately(currentTime + 60 * 60 * 48, 60);
    expect(tl.addressValue.toLowerCase()).is.eq(usdc);
    expect(tl.uintValue).is.eq(0);

    await expect(shop.setPositionDepositToken(networkToken)).revertedWith("TPS: Time Lock");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await expect(shop.setPositionDepositToken(networkToken)).revertedWith("TPS: Wrong address value");

    await shop.setPositionDepositToken(usdc);

    tl = await shop.timeLocks(id);
    expect(tl.time.toNumber()).is.eq(0);
    expect(tl.addressValue).is.eq(Misc.ZERO_ADDRESS);
    expect(tl.uintValue).is.eq(0);

    expect((await shop.positionDepositToken()).toLowerCase()).is.eq(usdc);
  });

});
