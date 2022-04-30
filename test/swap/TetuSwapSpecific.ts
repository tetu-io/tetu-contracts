import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {
  ISphereToken__factory,
  IStrategy,
  SphereTokenV2__factory,
  TetuSwapFactory, TetuSwapFactory__factory, TetuSwapPair__factory,
  TetuSwapRouter
} from "../../typechain";
import {utils} from "ethers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {ethers} from "hardhat";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {parseUnits} from "ethers/lib/utils";

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

  it.skip('swap sphere - usdc', async () => {
    const sphereOwner = await DeployerUtils.impersonate('0x7754d8b057CC1d2D857d897461DAC6C3235B4aAe');
    // const sphereCtr = await (new SphereTokenV2__factory(signer)).deploy();
    // console.log('sphereCtr', sphereCtr.address);
    // const sphere = sphereCtr.address;
    const sphere = MaticAddresses.SPHEREV2_TOKEN;
    const wmatic = MaticAddresses.WMATIC_TOKEN;
    const wmaticVault = '0xbd2e7f163d7605fa140d873fea3e28a031370363';
    const amountSphere = utils.parseUnits('1000');
    const amountMatic = utils.parseUnits('1000');

    await TokenUtils.getToken(sphere, signer.address, amountSphere.mul(10));
    await TokenUtils.getToken(wmatic, signer.address, amountMatic.mul(10));

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
    console.log('toinvest')
    await core.vaultController.setToInvest([sphereVault.address], 0);

    console.log('1')

    await factory.createPair(sphereVault.address, wmaticVault);
    console.log('2')
    const pair = await factory.getPair(sphere, wmatic);
    console.log('3')
    await SphereTokenV2__factory.connect(sphere, sphereOwner).setRouter(router.address, pair);
    console.log('4')
    await core.controller.setPureRewardConsumers([pair], true);
    console.log('5')
    const networkToken = await DeployerUtils.getNetworkTokenAddress();

    await factory.setPairRewardRecipients([pair], [signer.address]);
    console.log('6')
    await SphereTokenV2__factory.connect(sphere, sphereOwner).setFeeTypeExempt(sphereVault.address, true, 1);
    await SphereTokenV2__factory.connect(sphere, sphereOwner).setInitialDistributionFinished(true);

    console.log('try to add liquidity')
    await UniswapUtils.addLiquidity(
      signer,
      sphere,
      wmatic,
      amountSphere.div(2).toString(),
      amountMatic.div(2).toString(),
      factory.address,
      router.address
    );
    console.log('liquidity added')

    // await (await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', pair) as IUniswapV2Pair).sync()
    await UniswapUtils.swapExactTokensForTokens(
      signer,
      [sphere, wmatic],
      amountSphere.div(10).toString(),
      signer.address,
      router.address
    );
    console.log('swapped')

    await TokenUtils.transfer(sphere, signer, sphere, parseUnits('100').toString())
    await SphereTokenV2__factory.connect(sphere, sphereOwner).manualSwapBack();
  });


});
