import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {
  ISphereToken__factory,
  IStrategy,
  TetuSwapFactory,
  TetuSwapPair__factory,
  TetuSwapRouter
} from "../../typechain";
import {utils} from "ethers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ethers} from "hardhat";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu Swap specific tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let coreAddresses: CoreAddresses;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    const net = await ethers.provider.getNetwork();
    coreAddresses = await DeployerUtils.getCoreAddresses();

    factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', coreAddresses.swapFactory) as TetuSwapFactory;


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

  it.skip('swap sphere - usdc', async () => {
    const sphereOwner = await DeployerUtils.impersonate('0x7754d8b057CC1d2D857d897461DAC6C3235B4aAe');
    const sphere = MaticAddresses.SPHERE_TOKEN;
    const usdc = MaticAddresses.USDC_TOKEN;
    const usdcVault = '0xee3b4ce32a6229ae15903cda0a5da92e739685f7';
    const amountSphere = utils.parseUnits('100');
    const amountUsdc = utils.parseUnits('100', 6);

    await TokenUtils.getToken(sphere, signer.address, amountSphere.mul(10));
    await TokenUtils.getToken(usdc, signer.address, amountUsdc.mul(10));

    const [sphereVaultLogic, sphereVault, sphereStrategy] = await DeployerUtils.deployVaultAndStrategy(
      'SPHERE',
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        'NoopStrategy',
        core.controller.address, // _controller
        sphere, // _underlying
        vaultAddress, // _vault
        [], // __rewardTokens
        [sphere], // __assets
        35, // __platform
      ) as Promise<IStrategy>,
      core.controller.address,
      core.psVault.address,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    );

    console.log('deployed')
    await core.controller.addVaultsAndStrategies([sphereVault.address], [sphereStrategy.address]);

    await factory.createPair(sphereVault.address, usdcVault);
    const pair = await factory.getPair(sphere, usdc);

    await core.controller.setPureRewardConsumers([pair], true);

    const networkToken = await DeployerUtils.getNetworkTokenAddress();
    const router = await DeployerUtils.deployContract(signer, "TetuSwapRouter", factory.address, networkToken) as TetuSwapRouter;

    await factory.setPairRewardRecipients([pair], [signer.address]);

    await ISphereToken__factory.connect(sphere, sphereOwner).setFeeExempt(sphereVault.address, true);

    await UniswapUtils.addLiquidity(
      signer,
      sphere,
      usdc,
      amountSphere.toString(),
      amountUsdc.toString(),
      factory.address,
      router.address
    );

    // await (await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', pair) as IUniswapV2Pair).sync()
    await UniswapUtils.swapExactTokensForTokens(
      signer,
      [sphere, usdc],
      amountSphere.div(10).toString(),
      signer.address,
      router.address
    );
  });


});
