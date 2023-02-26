import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Bookkeeper} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {VaultUtils} from "../../VaultUtils";
import {BigNumber} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {MintHelperUtils} from "../../MintHelperUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../../scripts/addresses/MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Bookkeeper tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let bookkeeper: Bookkeeper;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    snapshotBefore = await TimeUtils.snapshot();
    bookkeeper = core.bookkeeper;
    await UniswapUtils.wrapNetworkToken(signer); // 10m wmatic
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

  it("should not deploy with zero controller", async () => {
    await expect(DeployerUtils.deployBookkeeper(signer, Misc.ZERO_ADDRESS)).rejectedWith('');
  });

  it("should not register strat action for non strat", async () => {
    await expect(bookkeeper.registerStrategyEarned('1')).is.rejectedWith("B: Only exist strategy");
  });

  it("should not register ppfs change for non forwarder", async () => {
    await expect(bookkeeper.registerPpfsChange(Misc.ZERO_ADDRESS, '1')).is.rejectedWith("B: Only exist forwarder or strategy");
  });

  it("should not register user action for non vault", async () => {
    await expect(bookkeeper.registerUserAction(Misc.ZERO_ADDRESS, '1', true)).is.rejectedWith("B: Only exist vault");
  });

  it("should not add vault", async () => {
    await expect(bookkeeper.connect(signer1).addVault(Misc.ZERO_ADDRESS)).is.rejectedWith("B: Not controller");
  });

  it("should not add strategy", async () => {
    await expect(bookkeeper.connect(signer1).addStrategy(Misc.ZERO_ADDRESS)).is.rejectedWith("B: Not controller");
  });

  it("is governance", async () => {
    expect(await bookkeeper.connect(signer1).isGovernance(Misc.ZERO_ADDRESS)).is.eq(false);
  });

  it("last hardwork", async () => {
    expect((await bookkeeper.connect(signer1).lastHardWork(Misc.ZERO_ADDRESS))[1]).is.eq(0);
  });

  it("remove vault and strategy manually", async () => {
    for (let i = 0; i < 3; i++) {
      const vault = await DeployerUtils.deployContract(signer, 'MockVault');
      const strategy = await DeployerUtils.deployContract(signer, 'MockStrategy');
      await core.controller.addVaultsAndStrategies([vault.address], [strategy.address]);
      await core.controller.connect(await DeployerUtils.impersonate(vault.address)).addStrategy(strategy.address)
    }

    let vaults = await bookkeeper.vaults();
    let strategies = await bookkeeper.strategies();
    console.log('vaults.length', vaults.length)
    console.log('strategies.length', strategies.length)
    expect(vaults.length).is.greaterThan(1);
    expect(strategies.length).is.greaterThan(1);

    await bookkeeper.removeFromVaults(0);
    await bookkeeper.removeFromStrategies(0);

    let vaultsAfter = await bookkeeper.vaults();
    let strategiesAfter = await bookkeeper.strategies();

    expect((vaultsAfter).length).is.eq(vaults.length - 1, 'existed vault should not be added');
    expect((strategiesAfter).length).is.eq(strategies.length - 1, 'existed strategy should not be added');

    expect(vaultsAfter[0]).is.eq(vaults[vaults.length - 1]);
    expect(strategiesAfter[0]).is.eq(strategies[strategies.length - 1]);

    vaults = await bookkeeper.vaults();
    strategies = await bookkeeper.strategies();
    console.log('vaults.length', vaults.length)
    console.log('strategies.length', strategies.length)

    await expect(bookkeeper.removeFromVaultsBatch([0, 2])).rejectedWith("B: Wrong index");
    await bookkeeper.removeFromVaultsBatch([2, 0]);
    await expect(bookkeeper.removeFromStrategiesBatch([0, 2])).rejectedWith("B: Wrong index");
    await bookkeeper.removeFromStrategiesBatch([2, 0]);

    vaultsAfter = await bookkeeper.vaults();
    strategiesAfter = await bookkeeper.strategies();

    expect((vaultsAfter).length).is.eq(1, 'existed vault should not be added');
    expect((strategiesAfter).length).is.eq(1, 'existed strategy should not be added');

    expect(vaultsAfter[0]).is.eq(vaults[1]);
    expect(strategiesAfter[0]).is.eq(strategies[1]);
  });

  it("user count should work correctly", async () => {
    const vault = core.psVault;

    // ********** USER1 deposit
    await MintHelperUtils.mint(core.controller, core.announcer, '100000', signer.address);
    await VaultUtils.deposit(signer, vault, BigNumber.from('1000'));

    let user1Bal = await bookkeeper.vaultUsersBalances(vault.address, signer.address)
    let vaultUsers = await bookkeeper.vaultUsersQuantity(vault.address);

    expect(user1Bal).eq(1000);
    expect(vaultUsers).eq(1);

    // ********** USER1 send to himself

    await vault.transfer(signer.address, user1Bal)
    user1Bal = await bookkeeper.vaultUsersBalances(vault.address, signer.address)
    vaultUsers = await bookkeeper.vaultUsersQuantity(vault.address);

    expect(user1Bal).eq(1000);
    expect(vaultUsers).eq(1);

    // ******** USER1 transfer to USER2
    await TokenUtils.transfer(vault.address, signer, signer1.address, '500');

    user1Bal = await bookkeeper.vaultUsersBalances(vault.address, signer.address)
    let user2Bal = await bookkeeper.vaultUsersBalances(vault.address, signer1.address)
    vaultUsers = await bookkeeper.vaultUsersQuantity(vault.address);


    expect(user1Bal).eq(500);
    expect(user2Bal).eq(500);
    expect(vaultUsers).eq(2);

    // ******** USER1 exit
    await vault.exit();

    user1Bal = await bookkeeper.vaultUsersBalances(vault.address, signer.address)
    user2Bal = await bookkeeper.vaultUsersBalances(vault.address, signer1.address)
    vaultUsers = await bookkeeper.vaultUsersQuantity(vault.address);


    expect(user1Bal).eq(0);
    expect(user2Bal).eq(500);
    expect(vaultUsers).eq(1);

    // *********** USER2 exit

    await vault.connect(signer1).exit();

    user1Bal = await bookkeeper.vaultUsersBalances(vault.address, signer.address)
    user2Bal = await bookkeeper.vaultUsersBalances(vault.address, signer1.address)
    vaultUsers = await bookkeeper.vaultUsersQuantity(vault.address);


    expect(user1Bal).eq(0);
    expect(user2Bal).eq(0);
    expect(vaultUsers).eq(0);

  });

});
