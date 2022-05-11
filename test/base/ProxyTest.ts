import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  NoopStrategy,
  SmartVault,
  SmartVaultV110,
  ProxyTest,
} from "../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {BigNumber, utils} from "ethers";
import {VaultUtils} from "../VaultUtils";
import {MintHelperUtils} from "../MintHelperUtils";
import {TokenUtils} from "../TokenUtils";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Proxy tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let core: CoreContractsWrapper;
  let networkToken: string;
  let tetu: string;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    user1 = (await ethers.getSigners())[1];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
    snapshotBefore = await TimeUtils.snapshot();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    tetu = core.rewardToken.address.toLowerCase();
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


  it("upgrade proxy v 1-1-0", async () => {
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('1500'));
    await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);
    // await TokenUtils.getToken(MaticAddresses.TETU_TOKEN, signer.address, utils.parseUnits('1000'));
    if (tetu ===  (await DeployerUtils.getTETUAddress()).toLowerCase()) {
      await TokenUtils.getToken(tetu, signer.address, utils.parseUnits('1000'));
    } else {
      await MintHelperUtils.mint(core.controller, core.announcer, '1000', signer.address);
    }

    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVaultV110") as SmartVaultV110;

    const vaultProxy1 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy1.address) as SmartVaultV110;
    const psEmptyStrategy1 = await DeployerUtils.deployContract(signer, "NoopStrategy",
    core.controller.address, networkToken, vault.address, [], [networkToken], 1) as NoopStrategy;


    await vault.initializeSmartVault(
      "TETU_PS1",
      "xTETU1",
      core.controller.address,
      networkToken,
      999999,
      false,
      Misc.ZERO_ADDRESS,
      0
    );

    await core.controller.addVaultsAndStrategies([vault.address], [psEmptyStrategy1.address]);
    await core.vaultController.addRewardTokens([vault.address], core.psVault.address)
    await core.vaultController.addRewardTokens([vault.address], tetu)

    await TokenUtils.approve(tetu, signer, vault.address, utils.parseUnits("100").toString());
    await vault.notifyTargetRewardAmount(
      tetu,
      utils.parseUnits("100")
    );

    // tslint:disable-next-line:ban-ts-ignore
    // @ts-ignore
    await VaultUtils.deposit(signer, vault, BigNumber.from('10'));
    await TimeUtils.advanceBlocksOnTs(999);
    await vault.exit();
    // tslint:disable-next-line:ban-ts-ignore
    // @ts-ignore
    await VaultUtils.deposit(signer, vault, BigNumber.from('10'));
    await TimeUtils.advanceBlocksOnTs(999);

    expect(await vault.underlyingBalanceWithInvestmentForHolder(signer.address))
      .is.equal(10);

    expect(await vault.name()).is.eq('TETU_PS1');

    expect(await vault.rewardTokensLength()).is.eq(2);
    const earned = await vault.earned(tetu, signer.address);
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

    await TokenUtils.transfer(vault.address, signer, user1.address, '10');
    await TokenUtils.transfer(vault.address, user1, signer.address, '10');

    await core.announcer.announceVaultStopBatch([vault.address]);

    await TimeUtils.advanceBlocksOnTs(999);

    await vault.getAllRewards();

    await core.vaultController.stopVaultsBatch([vault.address]);

    await TimeUtils.advanceBlocksOnTs(999);

    expect(await vault.name()).is.eq('TETU_PS1');

    expect(await vault.rewardTokensLength()).is.eq(2);

    expect(await vault.underlyingBalanceWithInvestmentForHolder(signer.address))
      .is.equal(10);
    expect(+utils.formatUnits(await vault.earned(tetu, signer.address))).is.eq(0);
    const balanceBefore = await TokenUtils.balanceOf(networkToken, signer.address);

    await vault.exit();

    expect(+utils.formatUnits(await vault.earned(tetu, signer.address))).is.eq(0);

    const balanceAfter = await TokenUtils.balanceOf(networkToken, signer.address);
    expect(balanceAfter.sub(balanceBefore).toString()).is.eq('10');
  });

  it('forbidden and not a contract test', async () =>{
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVaultV110") as SmartVaultV110;
    const vaultProxy1 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy1.address) as SmartVaultV110;

    await expect(vaultProxy1.upgrade(vault.address)).is.rejectedWith("forbidden");
    await vault.initializeSmartVault(
        "TETU_PS1",
        "xTETU1",
        signer.address,
        networkToken,
        999999,
      false,
      Misc.ZERO_ADDRESS,
      0
    );
    await expect(vaultProxy1.upgrade(signer.address)).is.rejectedWith('')
  });

  it('wrong impl test', async () =>{
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVaultV110") as SmartVaultV110;
    const vaultProxy1 = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy1.address) as SmartVaultV110;
    const newVaultLogic =  await DeployerUtils.deployContract(signer, "ProxyTest") as ProxyTest;

    await vault.initializeSmartVault(
        "TETU_PS1",
        "xTETU1",
        core.controller.address,
        networkToken,
        999999,
      false,
      Misc.ZERO_ADDRESS,
      0
    );

    await core.announcer.announceTetuProxyUpgradeBatch([
      vault.address
    ], [
      newVaultLogic.address
    ]);

    await TimeUtils.advanceBlocksOnTs(999);

    await expect(core.controller.upgradeTetuProxyBatch(
        [
          vault.address
        ], [
          newVaultLogic.address
        ]
    )).is.rejectedWith('wrong impl');
  });
});
