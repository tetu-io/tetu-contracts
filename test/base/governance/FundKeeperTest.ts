import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { FundKeeper } from "../../../typechain";
import { ethers } from "hardhat";
import { DeployerUtils } from "../../../scripts/deploy/DeployerUtils";
import { TimeUtils } from "../../TimeUtils";
import { UniswapUtils } from "../../UniswapUtils";
import { CoreContractsWrapper } from "../../CoreContractsWrapper";
import { TokenUtils } from "../../TokenUtils";
import { utils } from "ethers";

const { expect } = chai;
chai.use(chaiAsPromised);

describe("Fund Keeper tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let fundKeeper: FundKeeper;
  let usdc: string;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    fundKeeper = core.fundKeeper;
    usdc = await DeployerUtils.getUSDCAddress();
    await TokenUtils.getToken(
      usdc,
      signer.address,
      utils.parseUnits("1000000", 6)
    );
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

  it("salvage tokens", async () => {
    await TokenUtils.transfer(usdc, signer, fundKeeper.address, "1000");

    await core.announcer.announceTokenMove(
      13,
      core.fundKeeper.address,
      usdc,
      "1000"
    );
    await TimeUtils.advanceBlocksOnTs(
      (await core.announcer.timeLock()).toNumber()
    );
    await core.controller.fundKeeperTokenMove(
      core.fundKeeper.address,
      usdc,
      "1000"
    );

    expect(await TokenUtils.balanceOf(usdc, core.controller.address)).is.eq(
      "1000"
    );
  });

  it("should not salvage more than balance", async () => {
    await TokenUtils.transfer(usdc, signer, fundKeeper.address, "1000");

    const opCode = 13;
    const amount = 1001;
    const contract = core.fundKeeper.address;

    await core.announcer.announceTokenMove(opCode, contract, usdc, amount);

    await TimeUtils.advanceBlocksOnTs(
      (await core.announcer.timeLock()).toNumber()
    );

    await expect(
      core.controller.fundKeeperTokenMove(contract, usdc, amount)
    ).rejectedWith("not enough balance");
  });
});
