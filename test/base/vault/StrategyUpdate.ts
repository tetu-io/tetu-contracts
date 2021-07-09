import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {NoopStrategy, SmartVault, VaultProxy} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";

const {expect} = chai;
chai.use(chaiAsPromised);

const REWARD_DURATION = 60 * 60;

describe("Vault Strategy update test", () => {
  let snapshot: string;
  const underlying = MaticAddresses.USDC_TOKEN;
  let signer: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let vault: SmartVault;
  let vaultProxy: VaultProxy;

  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signerAddress = signer.address;

    core = await DeployerUtils.deployAllCoreContracts(signer);
    await core.mintHelper.startMinting();

    const vaultPure = await DeployerUtils.deployContract(signer, "SmartVault");
    vaultProxy = await DeployerUtils.deployContract(signer, "VaultProxy", vaultPure.address) as VaultProxy;
    vault = vaultPure.attach(vaultProxy.address) as SmartVault;

    await vault.initializeSmartVault(
        "NOOP",
        "tNOOP",
        core.controller.address,
        underlying,
        REWARD_DURATION
    );
    const strategyStub = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying]) as NoopStrategy;
    await core.controller.addVaultAndStrategy(vault.address, strategyStub.address);
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  describe("strategy update", async () => {
    it("should update", async () => {
      const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
          core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying]) as NoopStrategy;
      await vault.announceStrategyUpdate(strategy.address);
      const upgradeDelay = await vault.strategyUpdateTime();
      await TimeUtils.advanceBlocksOnTs(upgradeDelay.add(1).toNumber());
      await vault.setStrategy(strategy.address);
      expect(await vault.strategy()).at.eq(strategy.address);
    });
    it("should not update", async () => {
      const strategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
          core.controller.address, underlying, vault.address, [MaticAddresses.ZERO_ADDRESS], [underlying]) as NoopStrategy;
      await vault.announceStrategyUpdate(strategy.address);
      await expect(vault.setStrategy(strategy.address)).to.be.rejectedWith("not yet")
      expect(await vault.strategy()).not.eq(strategy.address);
    });
  });

});
