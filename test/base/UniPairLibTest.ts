import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {UniPairLibTest} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {UniswapUtils} from "../UniswapUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Array lib tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let usdc: string;
  let tetu: string;
  let networkToken: string;
  let core: CoreContractsWrapper;
  let unipair: UniPairLibTest;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);
    tetu = core.rewardToken.address.toLowerCase();
    unipair = await DeployerUtils.deployContract(signer, "UniPairLibTest") as UniPairLibTest;
    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("get price test", async () => {
  const pair = await UniswapUtils.createTetuUsdc(signer, core, "10000");
  const tetuPrice = await unipair.getTokenPrice(pair, tetu);
  expect(parseInt(tetuPrice._hex, 0)).is.equal(10**18)
  const usdcPrice = await unipair.getTokenPrice(pair, usdc);
  expect(parseInt(usdcPrice._hex, 0)).is.equal(10**18);
  await expect(unipair.callStatic.getTokenPrice(pair, networkToken))
        .is.rejectedWith("SFS: token not in lp");
  });

});