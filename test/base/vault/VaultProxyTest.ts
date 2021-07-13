import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Controller, SmartVault, VaultProxy} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

const TO_INVEST_NUMERATOR = 9700;
const TO_INVEST_DENOMINATOR = 10000;
const REWARD_DURATION = 60 * 60;

describe("Vault proxy test", () => {
  let snapshot: string;
  const underlying = MaticAddresses.USDC_TOKEN;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let controller: Controller;
  let vault: SmartVault;
  let vaultProxy: VaultProxy;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user = (await ethers.getSigners())[1];
    // deploy core contracts
    controller = await DeployerUtils.deployController(signer);
    const vaultPure = await DeployerUtils.deployContract(signer, "SmartVault");
    vaultProxy = await DeployerUtils.deployContract(signer, "VaultProxy", vaultPure.address) as VaultProxy;
    vault = vaultPure.attach(vaultProxy.address) as SmartVault;

    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        controller.address,
        underlying,
        REWARD_DURATION
    );
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  describe("vault proxy", async () => {
    it("proxy update", async () => {
      const newVault = await DeployerUtils.deployContract(signer, "SmartVault");
      await vault.scheduleUpgrade(newVault.address);
      const upgradeDelay = await vault.UPDATE_TIME_LOCK();
      await TimeUtils.advanceBlocksOnTs(upgradeDelay.add(1).toNumber());
      await vaultProxy.upgrade();
      expect(await vaultProxy.implementation()).at.eq(newVault.address);
      expect((await vault.underlying()).toLowerCase()).at.eq(underlying.toLowerCase());
      expect(await vault.duration()).at.eq(REWARD_DURATION);
    });
    it("should not proxy update", async () => {
      const newVault = await DeployerUtils.deployContract(user, "SmartVault");
      await expect(vault.connect(user).scheduleUpgrade(newVault.address))
      .rejectedWith("not controller");
    });

    it("should not proxy update when not scheduled", async () => {
      await expect(vaultProxy.upgrade()).rejectedWith('Upgrade not scheduled');
    });
  });

});
