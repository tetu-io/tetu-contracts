import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {UniPairLibTest} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {UniswapUtils} from "../UniswapUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Uniswap lib tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let usdc: string;
  let tetu: string;
  let networkToken: string;
  let core: CoreContractsWrapper;
  let unipair: UniPairLibTest;
  let pair: string;

  before(async function () {
    this.timeout(1200000);
    signer = await DeployerUtils.impersonate();
    core = await DeployerUtils.deployAllCoreContracts(signer);
    snapshot = await TimeUtils.snapshot();
    tetu = core.rewardToken.address.toLowerCase();
    unipair = await DeployerUtils.deployContract(signer, "UniPairLibTest") as UniPairLibTest;
    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
    networkToken = (await DeployerUtils.deployMockToken(signer, 'WETH')).address.toLowerCase();

    const uniData = await UniswapUtils.deployUniswap(signer);
    pair = await UniswapUtils.createPairForRewardTokenOnTestnet(
      signer,
      core,
      '10000',
      usdc,
      uniData.factory.address,
      uniData.router.address,
    )
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("get price test", async () => {
    const tetuPrice = await unipair.getTokenPrice(pair, tetu);
    expect(parseInt(tetuPrice._hex, 0)).is.equal(10 ** 18)
    const usdcPrice = await unipair.getTokenPrice(pair, usdc);
    expect(parseInt(usdcPrice._hex, 0)).is.equal(10 ** 18);
    await expect(unipair.callStatic.getTokenPrice(pair, networkToken))
      .is.rejectedWith("SFS: token not in lp");
  });

});
