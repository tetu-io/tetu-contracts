import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";

import {TimeUtils} from '../TimeUtils';
import {parseUnits} from "ethers/lib/utils";
import {
  IERC20,
  IERC20__factory,
  MockToken,
  TetuRewardRelayer,
  TetuUnpacking,
  Vesting
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;

describe("TetuRelayerTest", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let claimant: SignerWithAddress;

  let token: IERC20;
  let relayer: TetuRewardRelayer;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, claimant] = await ethers.getSigners();

    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }

    token = IERC20__factory.connect(MaticAddresses.TETU_TOKEN, owner);
    const controller = await DeployerUtils.deployController(owner);
    relayer = await DeployerUtils.deployContract(owner, 'TetuRewardRelayer', token.address, controller.address) as TetuRewardRelayer;

    await TokenUtils.getToken(token.address, owner.address, parseUnits('1'));

    await token.transfer(relayer.address, 1000)
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

  it("relay test", async function () {

    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }

    const balDF = await token.balanceOf(owner2.address);

    await expect(relayer.move(owner2.address, 100)).revertedWith('time-lock');
    await relayer.announceMove(owner2.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 3)
    await relayer.move(owner2.address, 100);
    console.log('1')

    const balDFAfter = await token.balanceOf(owner2.address);

    expect(balDFAfter.sub(balDF)).eq(100)

    await expect(relayer.move(owner2.address, 100)).revertedWith('delay');

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7)

    await expect(relayer.move(owner2.address, 100)).revertedWith('time-lock');
    await relayer.announceMove(owner2.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2)
    await relayer.move(owner2.address, 100);

    await expect(relayer.move(owner2.address, 100)).revertedWith('delay');

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7)

    await expect(relayer.move(owner2.address, 100)).revertedWith('time-lock');
    await relayer.announceMove(owner2.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2)
    await relayer.move(owner2.address, 100);
  });

});
