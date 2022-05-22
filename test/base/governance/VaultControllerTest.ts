import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {VaultController} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";

const {expect} = chai;
chai.use(chaiAsPromised);

const REWARD_DURATION = 60 * 60;

describe("Vault Controller tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let vaultController: VaultController;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    snapshotBefore = await TimeUtils.snapshot();
    vaultController = core.vaultController;
    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
    networkToken = (await DeployerUtils.deployMockToken(signer, 'WETH')).address.toLowerCase();
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
    await vaultController.addRewardTokens([core.psVault.address], networkToken);
    await vaultController.addRewardTokens([core.psVault.address], usdc);
    expect((await core.psVault.rewardTokens())[0].toLowerCase()).is.eq(networkToken);
    await vaultController.removeRewardTokens([core.psVault.address], networkToken);
    expect((await core.psVault.rewardTokens()).length).is.eq(1);
  });

});
