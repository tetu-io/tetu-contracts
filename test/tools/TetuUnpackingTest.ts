import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";

import {TimeUtils} from '../TimeUtils';
import {parseUnits} from "ethers/lib/utils";
import {IERC20, IERC20__factory, MockToken, TetuUnpacking, Vesting} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;

describe("TetuUnpackingTest", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let claimant: SignerWithAddress;

  let token: IERC20;
  let tetuUnpacking: TetuUnpacking;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, claimant] = await ethers.getSigners();

    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }

    token = IERC20__factory.connect(MaticAddresses.TETU_TOKEN, owner);
    tetuUnpacking = await DeployerUtils.deployContract(owner, 'TetuUnpacking') as TetuUnpacking;

    await TokenUtils.getToken(token.address, owner.address, parseUnits('1'));

    await token.transfer(tetuUnpacking.address, 100)
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

  it("distribute test", async function () {

    if (!(await DeployerUtils.isNetwork(137))) {
      return;
    }

    const balDF = await token.balanceOf('0x12a2CD7d359CC69F02215d0B72D39BcE66299b2E');
    const balB = await token.balanceOf('0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B');

    await tetuUnpacking.process();

    const balDFAfter = await token.balanceOf('0x12a2CD7d359CC69F02215d0B72D39BcE66299b2E');
    const balBAfter = await token.balanceOf('0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B');

    expect(balDFAfter.sub(balDF)).eq(30)
    expect(balBAfter.sub(balB)).eq(70)
  });

});
