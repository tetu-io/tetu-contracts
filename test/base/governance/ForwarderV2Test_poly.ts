import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ForwarderV2, IUniswapV2Factory} from "../../../typechain";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../../TimeUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../TokenUtils";
import {Misc} from "../../../scripts/utils/tools/Misc";
import {MaticAddresses} from "../../../scripts/addresses/MaticAddresses";
import {parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

describe("ForwarderV2 tests on poly", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;
  let forwarder: ForwarderV2;
  const amount = utils.parseUnits('10', 6);

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    if(hre.network.config.chainId !== 137) {
      return;
    }
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[1];
    signerAddress = signer.address;

    core = await DeployerUtils.getCoreAddressesWrapper(signer);
    forwarder = (await DeployerUtils.deployForwarderV2(signer, core.controller.address))[0];

    await core.announcer.announceAddressChange(2, forwarder.address);
    await core.announcer.announceRatioChange(9, 50, 100);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await core.controller.setFeeRewardForwarder(forwarder.address);
    await core.controller.setRewardDistribution([forwarder.address], true);
    await core.controller.setPSNumeratorDenominator(50, 100);


    await forwarder.setSlippageNumerator(50);
    await forwarder.setLiquidityNumerator(50);
    await forwarder.setLiquidityRouter(MaticAddresses.TETU_SWAP_ROUTER);
    await forwarder.setLiquidator(MaticAddresses.LIQUIDATOR);
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

  it("should distribute", async () => {
    if(hre.network.config.chainId !== 137) {
      return;
    }
    const usdc = MaticAddresses.USDC_TOKEN;
    const _amount = parseUnits('100', 6);
    const vault = core.psVault;

    await core.vaultController.addRewardTokens([vault.address], vault.address);

    const fundKeeperUSDCBalBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, core.fundKeeper.address), 6);
    const psVaultBalBefore = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, core.psVault.address));
    const forwarderUsdcBalBefore = +utils.formatUnits(await TokenUtils.balanceOf(usdc, forwarder.address), 6);
    const forwarderTetuBalBefore = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, forwarder.address));

    await TokenUtils.getToken(usdc, signer.address, _amount);
    await TokenUtils.approve(usdc, signer, forwarder.address, _amount.toString());
    await forwarder.distribute(_amount, usdc, vault.address);


    const fundKeeperUSDCBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, core.fundKeeper.address), 6);
    const psVaultBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, core.psVault.address));
    const forwarderUsdcBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(usdc, forwarder.address), 6);
    const forwarderTetuBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken.address, forwarder.address));

    const fundKeeperUSDCBal = fundKeeperUSDCBalAfter - fundKeeperUSDCBalBefore;
    const psVaultBal = psVaultBalAfter - psVaultBalBefore;
    const forwarderUsdcBal = forwarderUsdcBalAfter - forwarderUsdcBalBefore;
    const forwarderTetuBal = forwarderTetuBalAfter - forwarderTetuBalBefore;

    console.log('fundKeeperUSDCBal', fundKeeperUSDCBal);
    console.log('psVaultBal', psVaultBal);
    console.log('forwarderUsdcBal', forwarderUsdcBal);
    console.log('forwarderTetuBal', forwarderTetuBal);

    expect(fundKeeperUSDCBal).eq(10);
    // expect(psVaultBal).eq(1);
    expect(forwarderUsdcBal).below(0.01);
    expect(forwarderTetuBal).below(0.01);
  });

});
