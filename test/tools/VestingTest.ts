import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";

import {TimeUtils} from '../TimeUtils';
import {parseUnits} from "ethers/lib/utils";
import {MockToken, Vesting} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;

describe("vesting tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let claimant: SignerWithAddress;

  let token: MockToken;
  let vesting: Vesting;

  const vestingPeriod = 60 * 60 * 24 * 365;
  const cliffPeriod = 60 * 60 * 24 * 183;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, claimant] = await ethers.getSigners();
    token = await DeployerUtils.deployMockToken(owner, 'MISTRAL');
    await expect(DeployerUtils.deployContract(owner, 'Vesting', Misc.ZERO_ADDRESS, vestingPeriod, cliffPeriod, claimant.address)).revertedWith('zero address');
    vesting = await DeployerUtils.deployContract(owner, 'Vesting', token.address, vestingPeriod, cliffPeriod, claimant.address) as Vesting;
    await token.transfer(vesting.address, 10_000)
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

  it("start and claim in a loop", async function () {
    await vesting.start(10_000);

    await TimeUtils.advanceBlocksOnTs(cliffPeriod);

    for (let i = 0; i < 36; i++) {
      const bal = await token.balanceOf(claimant.address);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 10)
      await vesting.connect(claimant).claim();
      console.log('i', i)
      expect((await token.balanceOf(claimant.address)).sub(bal)).eq(Math.floor(10_000 / 36.5))
    }
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 10);
    await vesting.connect(claimant).claim();

    expect(await token.balanceOf(vesting.address)).eq(0)
    expect(await token.balanceOf(claimant.address)).eq(10_000)
  });

  it("start and claim after the whole period", async function () {
    await vesting.start(10_000);

    await TimeUtils.advanceBlocksOnTs(cliffPeriod + vestingPeriod);

    await vesting.connect(claimant).claim();

    expect(await token.balanceOf(vesting.address)).eq(0)
    expect(await token.balanceOf(claimant.address)).eq(10_000)
  });

  it("already started revert", async function () {
    await vesting.start(10_000);
    await expect(vesting.start(10_000)).revertedWith("Already started")
  });

  it("claim from not claimant revert", async function () {
    await expect(vesting.claim()).revertedWith("Not claimant")
  });

  it("claim from not started revert", async function () {
    await expect(vesting.connect(claimant).claim()).revertedWith("Not started")
  });

  it("claim too early revert", async function () {
    await vesting.start(10_000);
    await expect(vesting.connect(claimant).claim()).revertedWith("Too early")
  });

  it("claim zero revert", async function () {
    await vesting.start(10_000);
    await TimeUtils.advanceBlocksOnTs(cliffPeriod + vestingPeriod);
    await vesting.connect(claimant).claim();
    await expect(vesting.connect(claimant).claim()).revertedWith("Nothing to claim")
  });

});
