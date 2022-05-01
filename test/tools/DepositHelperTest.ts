import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DepositHelper, SmartVault} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MintHelperUtils} from "../MintHelperUtils";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Deposit Helper tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let gov: SignerWithAddress;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let depositHelper: DepositHelper;
  // let usdc: string;
  // let networkToken: string;
  let allVaults: string[];
  const activeVaults: {
    vaultAddress: string;
    underlyingAddress: string;
    decimals: number;
  }[] = [];

  const excludedVaults = [
      '0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33'
  ]

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    gov = await DeployerUtils.impersonate();
    core = await DeployerUtils.getCoreAddressesWrapper(gov);

    depositHelper = await DeployerUtils.deployContract(signer, 'DepositHelper') as DepositHelper;
    await core.controller.changeWhiteListStatus([depositHelper.address], true);

    // usdc = await DeployerUtils.getUSDCAddress();
    // networkToken = await DeployerUtils.getNetworkTokenAddress();
    // await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    // await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('100000'));

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


  it("Should deposit and withdraw from vaults", async () => {
    const testVault = async (vaultAddress: string) => {
      console.log('-----------------------------------------------------');
      console.log('vaultAddress', vaultAddress);
      if (excludedVaults.includes(vaultAddress)) {
        console.log('Vault excluded.');
        return;
      }
      // const vault = await DeployerUtils.connectVault(vaultAddress, signer);
      const vault = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
      const vaultActive = await vault.active();
      if (!vaultActive) return;

      console.log('vaultActive');
      const underlyingAddress = await vault.underlying();
      console.log('underlyingAddress', underlyingAddress);
      const decimals = await TokenUtils.decimals(underlyingAddress)
      console.log('decimals', decimals);
      activeVaults.push({vaultAddress, underlyingAddress, decimals});

      const amount = utils.parseUnits('10', decimals);
      const balanceInitial = await TokenUtils.balanceOf(underlyingAddress, signer.address);
      try {
        await TokenUtils.getToken(underlyingAddress, signer.address, amount);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Please add holder')) {
          console.warn(e.message + ' - Skipping vault test');
          return
        } else throw e;
      }
      const balanceBefore = await TokenUtils.balanceOf(underlyingAddress, signer.address);
      await TokenUtils.approve(underlyingAddress, signer, depositHelper.address, amount.toString());
      console.log('depositToVault...');
      await depositHelper.depositToVault(vaultAddress, amount);
      const balanceAfter = await TokenUtils.balanceOf(underlyingAddress, signer.address);

      const sharesAmount = await TokenUtils.balanceOf(vaultAddress, signer.address);
      console.log('sharesAmount', sharesAmount);

      await TokenUtils.approve(vaultAddress, signer, depositHelper.address, sharesAmount.toString());
      console.log('depositToVault...');
      await depositHelper.withdrawFromVault(vaultAddress, sharesAmount);
      const sharesAfter = await TokenUtils.balanceOf(vaultAddress, signer.address);

      expect(balanceBefore.sub(balanceInitial)).is.eq(amount);
      expect(balanceAfter).is.eq(balanceInitial);
      expect(sharesAmount).is.gt(0);
      expect(sharesAfter).is.eq(0);

      console.log('+++vault test passed', vaultAddress);
    }

    allVaults = await core.bookkeeper.vaults();
    console.log('allVaults.length', allVaults.length);
    const slicedVaults = allVaults.slice(-20); // 20 last vaults (some of that will be skipped with no biggest holder)
    for (const vault of slicedVaults) await testVault(vault);

  });

  it("Should salvage token", async () => {

    await MintHelperUtils.mint(core.controller, core.announcer, '1000000', signer.address);
    await TokenUtils.transfer(core.rewardToken.address, signer, depositHelper.address, utils.parseUnits("1000000").toString());
    const govBal = await TokenUtils.balanceOf(core.rewardToken.address, signer.address);
    const bal = await TokenUtils.balanceOf(core.rewardToken.address, depositHelper.address);
    expect(bal.isZero()).is.eq(false);
    await depositHelper.salvage(core.rewardToken.address, bal);
    expect((await TokenUtils.balanceOf(core.rewardToken.address, depositHelper.address)).isZero()).is.eq(true);
    expect(await TokenUtils.balanceOf(core.rewardToken.address, signer.address))
      .is.eq(govBal.add(bal));
  });

});
