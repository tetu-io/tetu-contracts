import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ContractUtils} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Contract utils tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let utils: ContractUtils;

  const ercTokens: string[] = [];

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    utils = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;
    ercTokens.push(await DeployerUtils.getUSDCAddress())
    ercTokens.push(await DeployerUtils.getNetworkTokenAddress())
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });


  it("symbols", async () => {
    expect((await utils.erc20Symbols(ercTokens))[0]).is.eq('USDC');
  });

  it("names", async () => {
    expect((await utils.erc20Names(ercTokens))[0]).is.contain('USD Coin');
  });

  it("decimals", async () => {
    expect((await utils.erc20Decimals(ercTokens))[0]).is.eq(6);
  });

  it("balances", async () => {
    expect((await utils.erc20Balances(ercTokens, signer.address))[0]).is.eq(0);
  });

  it("supply", async () => {
    expect((await utils.erc20TotalSupply(ercTokens))[0]).is.not.eq(0);
  });

});
