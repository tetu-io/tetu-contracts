import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {NoopStrategy, SmartVault} from "../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {BigNumber, utils} from "ethers";
import {VaultUtils} from "../VaultUtils";
import {MintHelperUtils} from "../MintHelperUtils";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {Erc20Utils} from "../Erc20Utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Controller tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let core: CoreContractsWrapper;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signer1 = (await ethers.getSigners())[1];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
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

  it("upgrade two proxies with the same logic v 1-0-0", async () => {
    await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);

    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVaultV1_0_0");

    const vaultProxy1 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const psVault1 = vaultLogic.attach(vaultProxy1.address) as SmartVault;
    const psEmptyStrategy1 = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, core.rewardToken.address, psVault1.address, [], [core.rewardToken.address]) as NoopStrategy;

    const vaultProxy2 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const psVault2 = vaultLogic.attach(vaultProxy2.address) as SmartVault;
    const psEmptyStrategy2 = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, core.rewardToken.address, psVault2.address, [], [core.rewardToken.address]) as NoopStrategy;


    await psVault1.initializeSmartVault(
        "TETU_PS1",
        "xTETU1",
        core.controller.address,
        core.rewardToken.address,
        1
    );

    await psVault2.initializeSmartVault(
        "TETU_PS2",
        "xTETU2",
        core.controller.address,
        core.rewardToken.address,
        1
    );

    await core.controller.addVaultAndStrategy(psVault1.address, psEmptyStrategy1.address);
    await core.controller.addVaultAndStrategy(psVault2.address, psEmptyStrategy2.address);

    await psVault1.addRewardToken(MaticAddresses.WMATIC_TOKEN);
    await psVault2.addRewardToken(MaticAddresses.WMATIC_TOKEN);

    await VaultUtils.deposit(signer, psVault1, BigNumber.from('10'));
    await VaultUtils.deposit(signer, psVault2, BigNumber.from('20'));

    expect(await psVault1.name()).is.eq('TETU_PS1');
    expect(await psVault2.name()).is.eq('TETU_PS2');

    expect(await psVault1.rewardTokensLength()).is.eq(1);
    expect(await psVault2.rewardTokensLength()).is.eq(1);

    expect(await psVault1.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(10);
    expect(await psVault2.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(20);


    const newVaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");

    await core.announcer.announceTetuProxyUpgradeBatch([
      psVault1.address,
      psVault2.address
    ], [
      newVaultLogic.address,
      newVaultLogic.address
    ]);

    await TimeUtils.advanceBlocksOnTs(1);

    await core.controller.upgradeTetuProxyBatch(
        [
          psVault1.address,
          psVault2.address
        ], [
          newVaultLogic.address,
          newVaultLogic.address
        ]
    );

    expect(await psVault1.name()).is.eq('TETU_PS1');
    expect(await psVault2.name()).is.eq('TETU_PS2');

    expect(await psVault1.rewardTokensLength()).is.eq(1);
    expect(await psVault2.rewardTokensLength()).is.eq(1);

    expect(await psVault1.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(10);
    expect(await psVault2.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(20);
  });


  it("upgrade proxy v 1-0-0", async () => {
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
    await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);

    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVaultV1_0_0");

    const vaultProxy1 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy1.address) as SmartVault;
    const psEmptyStrategy1 = await DeployerUtils.deployContract(signer, "NoopStrategy",
        core.controller.address, MaticAddresses.WMATIC_TOKEN, vault.address, [], [MaticAddresses.WMATIC_TOKEN]) as NoopStrategy;


    await vault.initializeSmartVault(
        "TETU_PS1",
        "xTETU1",
        core.controller.address,
        MaticAddresses.WMATIC_TOKEN,
        999999
    );

    await core.controller.addVaultAndStrategy(vault.address, psEmptyStrategy1.address);

    await vault.addRewardToken(core.psVault.address);
    await vault.addRewardToken(core.rewardToken.address);
    await Erc20Utils.approve(core.rewardToken.address, signer, vault.address, utils.parseUnits("100").toString());
    await vault.notifyTargetRewardAmount(
        core.rewardToken.address,
        utils.parseUnits("100")
    );

    await VaultUtils.deposit(signer, vault, BigNumber.from('10'));
    await TimeUtils.advanceBlocksOnTs(999);
    await vault.exit();
    await VaultUtils.deposit(signer, vault, BigNumber.from('10'));
    await TimeUtils.advanceBlocksOnTs(999);

    expect(await vault.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(10);

    expect(await vault.name()).is.eq('TETU_PS1');

    expect(await vault.rewardTokensLength()).is.eq(2);
    const earned = await vault.earned(core.rewardToken.address, signer.address);
    console.log('earned', earned.toString());
    expect(+utils.formatUnits(earned)).is.greaterThan(0);

    expect(await vault.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(10);


    const newVaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");

    await core.announcer.announceTetuProxyUpgradeBatch([
      vault.address
    ], [
      newVaultLogic.address
    ]);

    await TimeUtils.advanceBlocksOnTs(999);

    await core.controller.upgradeTetuProxyBatch(
        [
          vault.address
        ], [
          newVaultLogic.address
        ]
    );

    await core.announcer.announceVaultStopBatch([vault.address]);
    await TimeUtils.advanceBlocksOnTs(999);
    await core.vaultController.stopVaultsBatch([vault.address]);

    expect(await vault.name()).is.eq('TETU_PS1');

    expect(await vault.rewardTokensLength()).is.eq(2);

    expect(await vault.underlyingBalanceWithInvestmentForHolder(signer.address))
    .is.equal(10);
    expect(+utils.formatUnits(await vault.earned(core.rewardToken.address, signer.address))).is.eq(0);
    await vault.exit();
    expect(+utils.formatUnits(await vault.earned(core.rewardToken.address, signer.address))).is.eq(0);
  });

});
