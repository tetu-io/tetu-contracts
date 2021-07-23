import {ethers} from "hardhat";
import chai from "chai";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../../MaticAddresses";
import {UniswapUtils} from "../../UniswapUtils";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {TimeUtils} from "../../TimeUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {MintHelper} from "../../../typechain";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Mint helper tests", () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let minter: MintHelper;

  before(async () => {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    // deploy core contracts
    core = await DeployerUtils.deployAllCoreContracts(signer);
    minter = core.mintHelper;
    await UniswapUtils.wrapMatic(signer);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER,
        MaticAddresses.USDC_TOKEN, utils.parseUnits("10000", 18))
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


  it("should not start mint twice", async () => {
    await minter.startMinting();
    await expect(minter.startMinting()).rejectedWith('already started');
  });

  it("should not mint zero amount", async () => {
    await expect(minter.mint('0')).rejectedWith('Amount should be greater than 0')
  });

  it("should not work without token", async () => {
    const controller = await DeployerUtils.deployController(signer);
    const newMinter = await DeployerUtils.deployMintHelper(signer, controller.address, [signer.address], [3000]);
    await expect(newMinter.mint('1')).rejectedWith('Token not init');
    // await expect(newMinter.changeAdmin(minter.address)).rejectedWith('Token not init');
  });

  it("should not set empty funds", async () => {
    await expect(minter.setOperatingFunds([], [])).rejectedWith("empty funds");
  });

  // it("should not change admin to zero", async () => {
  //   await expect(minter.changeAdmin(MaticAddresses.ZERO_ADDRESS)).rejectedWith('Address should not be 0');
  // });
});

