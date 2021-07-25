import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {FundKeeper} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {Erc20Utils} from "../../Erc20Utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Fund Keeper tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let fundKeeper: FundKeeper;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    fundKeeper = core.fundKeeper;
    await UniswapUtils.wrapMatic(signer); // 10m wmatic
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
    await Erc20Utils.transfer(MaticAddresses.WMATIC_TOKEN, signer, fundKeeper.address, '1000');

    await core.announcer.announceTokenMove(13, core.fundKeeper.address, MaticAddresses.WMATIC_TOKEN, '1000');
    await TimeUtils.advanceBlocksOnTs((await core.announcer.timeLock()).toNumber());
    await core.controller.salvageFund(core.fundKeeper.address, MaticAddresses.WMATIC_TOKEN, '1000')

    expect(await Erc20Utils.balanceOf(MaticAddresses.WMATIC_TOKEN, core.controller.address))
    .is.eq('1000');
  });

  it("should not salvage more than balance", async () => {
    await Erc20Utils.transfer(MaticAddresses.WMATIC_TOKEN, signer, fundKeeper.address, '1000');

    const opCode = 13;
    const amount = 1001;
    const contract = core.fundKeeper.address;

    await core.announcer.announceTokenMove(opCode, contract, MaticAddresses.WMATIC_TOKEN, amount);

    await TimeUtils.advanceBlocksOnTs((await core.announcer.timeLock()).toNumber());

    await expect(core.controller.salvageFund(contract, MaticAddresses.WMATIC_TOKEN, amount)).rejectedWith("not enough balance");
  });


});
