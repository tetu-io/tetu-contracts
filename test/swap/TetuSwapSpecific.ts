import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {
  IERC20__factory,
  ISphereToken__factory,
  IStrategy,
  TetuSwapFactory,
  TetuSwapFactory__factory,
  TetuSwapRouter
} from "../../typechain";
import {utils} from "ethers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import hre, {ethers} from "hardhat";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu Swap specific tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let router: TetuSwapRouter;
  let coreAddresses: CoreAddresses;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddressesWrapper(signer);
    snapshotBefore = await TimeUtils.snapshot();

    const net = await ethers.provider.getNetwork();
    coreAddresses = await DeployerUtils.getCoreAddresses();

    // factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', coreAddresses.swapFactory) as TetuSwapFactory;
    // router = await DeployerUtils.connectInterface(signer, 'TetuSwapRouter', coreAddresses.swapRouter) as TetuSwapRouter;
    factory = TetuSwapFactory__factory.connect((await DeployerUtils.deployTetuProxyControlled(signer, 'TetuSwapFactory'))[0].address, signer);
    await factory.initialize(core.controller.address);
    router = await DeployerUtils.deployContract(signer, 'TetuSwapRouter', factory.address, MaticAddresses.WMATIC_TOKEN) as TetuSwapRouter;

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


  it('ttt', async () => {
    const sphereSignerAdr = '0x7754d8b057CC1d2D857d897461DAC6C3235B4aAe';
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [sphereSignerAdr],
    });
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [sphereSignerAdr, "0x1431E0FAE6D7217CAA0000000"],
    });
    const sphereOwner = await ethers.getSigner(sphereSignerAdr);
    const sphere = '0x62F594339830b90AE4C084aE7D223fFAFd9658A7';
    const amountSphere = parseUnits('100');


    await IERC20__factory.connect(sphere, sphereOwner).approve(sphereOwner.address, amountSphere);
    await IERC20__factory.connect(sphere, sphereOwner).transferFrom(sphereOwner.address, user.address, amountSphere);
    console.log('1');

    const sphereCtr = ISphereToken__factory.connect(sphere, sphereOwner);
    await sphereCtr.setInitialDistributionFinished(true);

    await IERC20__factory.connect(sphere, user).approve(user.address, Misc.MAX_UINT);
    expect(await IERC20__factory.connect(sphere, user).balanceOf(user.address)).above(parseUnits('1'));
    await IERC20__factory.connect(sphere, user).transfer('0x9cC56Fa7734DA21aC88F6a816aF10C5b898596Ce', parseUnits('1'));
  });

  it('swap sphere - usdc', async () => {
    const sphereOwner = await DeployerUtils.impersonate('0x7754d8b057CC1d2D857d897461DAC6C3235B4aAe');
    // const sphereCtr = await (new SphereTokenV2__factory(signer)).deploy();
    // console.log('sphereCtr', sphereCtr.address);
    // const sphere = sphereCtr.address;
    const sphere = MaticAddresses.SPHEREV3_TOKEN;
    const oppositeToken = MaticAddresses.USDC_TOKEN;
    const oppositeTokenVault = '0xee3b4ce32a6229ae15903cda0a5da92e739685f7';
    const amountSphere = parseUnits('1');
    const amountOppositeToken = utils.parseUnits('1', 6);

    const sphereCtr = ISphereToken__factory.connect(sphere, sphereOwner);

    await IERC20__factory.connect(sphere, sphereOwner).transfer(signer.address, amountSphere.mul(10))

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
    // await core.controller.addVaultsAndStrategies([sphereVault.address], [sphereStrategy.address]);
    console.log('toinvest')
    await core.vaultController.setToInvest([sphereVault.address], 0);

    console.log('1')

    await factory.createPair(sphereVault.address, oppositeTokenVault);
    console.log('2')
    const pair = await factory.getPair(sphere, oppositeToken);
    // console.log('3')
    // await sphereCtr.init(router.address);
    console.log('4')
    await core.controller.setPureRewardConsumers([pair], true);
    console.log('5')
    // const networkToken = await DeployerUtils.getNetworkTokenAddress();

    await factory.setPairRewardRecipients([pair], [signer.address]);
    // console.log('setInitialDistributionFinished')
    await sphereCtr.setInitialDistributionFinished(true);
    // console.log('setFeeTypeExempt')
    // await sphereCtr.setFeeTypeExempt(sphereVault.address, true, 1);

    await TokenUtils.getToken(sphere, signer.address, amountSphere.mul(10));
    await TokenUtils.getToken(oppositeToken, signer.address, amountOppositeToken.mul(10));

    console.log('try to add liquidity')
    await UniswapUtils.addLiquidity(
      signer,
      sphere,
      oppositeToken,
      amountSphere.div(2).toString(),
      amountOppositeToken.div(2).toString(),
      factory.address,
      router.address
    );
    console.log('liquidity added')
    await UniswapUtils.swapExactTokensForTokens(
      signer,
      [sphere, oppositeToken],
      amountSphere.div(100).toString(),
      signer.address,
      router.address
    );
    console.log('swapped')
  });


});
