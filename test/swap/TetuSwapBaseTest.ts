import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TetuSwapPair, UniswapV2Factory, UniswapV2Router02} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu pawnshop base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let factory: UniswapV2Factory;
  let router: UniswapV2Router02;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    user3 = (await ethers.getSigners())[3];

    factory = await DeployerUtils.deployContract(signer, 'UniswapV2Factory', signer.address) as UniswapV2Factory;
    router = await DeployerUtils.deployContract(signer, 'UniswapV2Router02', factory.address, MaticAddresses.WMATIC_TOKEN) as UniswapV2Router02;

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
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

  it("create pair USDC-WMATIC", async () => {
    console.log('hash', await factory.calcHash());
    await factory.createPair(MaticAddresses.USDC_TOKEN, MaticAddresses.WMATIC_TOKEN);

    const lp = await factory.getPair(MaticAddresses.USDC_TOKEN, MaticAddresses.WMATIC_TOKEN);
    const lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;

    expect(await lpCtr.symbol()).is.eq('TLP_WMATIC_USDC');

    await UniswapUtils.addLiquidity(
        signer,
        MaticAddresses.USDC_TOKEN,
        MaticAddresses.WMATIC_TOKEN,
        utils.parseUnits('100', 6).toString(),
        utils.parseUnits('100').toString(),
        factory.address,
        router.address
    );

    expect(+utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, lp), 6)).is.eq(100);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, lp))).is.eq(100);

    await UniswapUtils.swapExactTokensForTokens(
        signer,
        [MaticAddresses.USDC_TOKEN, MaticAddresses.WMATIC_TOKEN],
        utils.parseUnits("10", 6).toString(),
        signer.address,
        router.address
    );

    expect(+utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.USDC_TOKEN, lp), 6)).is.eq(110);
    expect(+utils.formatUnits(await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, lp))).is.eq(90.93389106119851);

  });

});
