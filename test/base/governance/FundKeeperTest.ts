import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {FundKeeper} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {UniswapUtils} from "../../UniswapUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {TokenUtils} from "../../TokenUtils";
import {utils} from "ethers";
import {MintHelperUtils} from "../../MintHelperUtils";

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
  let usdc: string;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    signer1 = (await ethers.getSigners())[1];
    signerAddress = signer.address;
    core = await DeployerUtils.deployAllCoreContracts(signer);
    snapshotBefore = await TimeUtils.snapshot();
    fundKeeper = core.fundKeeper;
    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
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
    await TokenUtils.transfer(usdc, signer, fundKeeper.address, '1000');

    await core.announcer.announceTokenMove(13, core.fundKeeper.address, usdc, '1000');
    await TimeUtils.advanceBlocksOnTs((await core.announcer.timeLock()).toNumber());
    await core.controller.fundKeeperTokenMove(core.fundKeeper.address, usdc, '1000')

    expect(await TokenUtils.balanceOf(usdc, core.controller.address))
      .is.eq('1000');
  });

  it("should not salvage more than balance", async () => {
    await TokenUtils.transfer(usdc, signer, fundKeeper.address, '1000');

    const opCode = 13;
    const amount = 1001;
    const contract = core.fundKeeper.address;

    await core.announcer.announceTokenMove(opCode, contract, usdc, amount);

    await TimeUtils.advanceBlocksOnTs((await core.announcer.timeLock()).toNumber());

    await expect(core.controller.fundKeeperTokenMove(contract, usdc, amount)).rejectedWith("not enough balance");
  });

  it("deposit/withdraw vault", async () => {
    await core.controller.changeWhiteListStatus([fundKeeper.address], true)

    await MintHelperUtils.mint(core.controller, core.announcer, '1000', fundKeeper.address)

    await expect(fundKeeper.depositToVault(core.psVault.address, 100)).rejectedWith('time lock');
    await fundKeeper.announceVaultDeposit(core.psVault.address);
    await expect(fundKeeper.depositToVault(core.psVault.address, 100)).rejectedWith('time lock');
    await expect(fundKeeper.depositToVault(core.announcer.address, 100)).rejectedWith('!vault');

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    await expect(fundKeeper.connect(signer1).depositToVault(core.psVault.address, 100)).rejectedWith('Not gov');

    await fundKeeper.depositToVault(core.psVault.address, 100);
    expect(await core.psVault.balanceOf(fundKeeper.address)).eq(100)

    // second deposit

    await fundKeeper.announceVaultDeposit(core.psVault.address);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await fundKeeper.depositToVault(core.psVault.address, 100);
    expect(await core.psVault.balanceOf(fundKeeper.address)).eq(200)

    // withdraw

    await expect(fundKeeper.connect(signer1).withdrawFromVault(core.psVault.address, 100)).rejectedWith('Not gov');
    await expect(fundKeeper.connect(signer1).withdrawFromVault(core.announcer.address, 100)).rejectedWith('Not gov');
    await fundKeeper.withdrawFromVault(core.psVault.address, 100);

    expect(await core.psVault.balanceOf(fundKeeper.address)).eq(100)

    console.log('1 total supply', (await core.psVault.totalSupply()).toString())
    console.log('1 invested', (await core.psVault.underlyingBalanceWithInvestment()).toString())

    await MintHelperUtils.mint(core.controller, core.announcer, '100', core.psVault.address)

    console.log('total supply', (await core.psVault.totalSupply()).toString())
    console.log('invested', (await core.psVault.underlyingBalanceWithInvestment()).toString())

    await fundKeeper.withdrawFromVault(core.psVault.address, 100);

    expect(await core.psVault.balanceOf(fundKeeper.address)).eq(0)
  });


});
