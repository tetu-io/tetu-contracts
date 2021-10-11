import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {VaultController} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";

const {expect} = chai;
chai.use(chaiAsPromised);

const REWARD_DURATION = 60 * 60;

describe("Controller tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  const underlying = MaticAddresses.USDC_TOKEN;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let vaultController: VaultController;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    vaultController = core.vaultController;
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

  it("should change vault statuses", async () => {
    await vaultController.changeVaultsStatuses([core.psVault.address], [false]);
    expect(await core.psVault.active()).is.eq(false);
  });

  it("should change reward tokens", async () => {
    expect((await core.psVault.rewardTokens()).length).is.eq(0);
    await vaultController.addRewardTokens([core.psVault.address], MaticAddresses.WMATIC_TOKEN);
    await vaultController.addRewardTokens([core.psVault.address], MaticAddresses.USDC_TOKEN);
    expect((await core.psVault.rewardTokens())[0].toLowerCase()).is.eq(MaticAddresses.WMATIC_TOKEN);
    await vaultController.removeRewardTokens([core.psVault.address], MaticAddresses.WMATIC_TOKEN);
    expect((await core.psVault.rewardTokens()).length).is.eq(1);
  });

});
