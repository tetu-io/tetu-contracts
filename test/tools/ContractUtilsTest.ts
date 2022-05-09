import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ContractUtils} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Contract utils tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let util: ContractUtils;
  let addressWithUsdc: ContractUtils;
  let addressWithoutUsdc: ContractUtils;

  const ercTokens: string[] = [];
  const addresses: string[] = [];

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    util = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;
    addressWithUsdc = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;
    addressWithoutUsdc = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;
    addresses.push(addressWithUsdc.address)
    addresses.push(addressWithoutUsdc.address)
    ercTokens.push(await DeployerUtils.getUSDCAddress())
    ercTokens.push(await DeployerUtils.getNetworkTokenAddress())
    await TokenUtils.getToken(ercTokens[0], signer.address, utils.parseUnits('1000', 6));
    await TokenUtils.transfer(ercTokens[0], signer, addresses[0], "1000000000");
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });


  it("symbols", async () => {
    expect((await util.erc20Symbols(ercTokens))[0]).is.eq('USDC');
  });

  it("names", async () => {
    expect((await util.erc20Names(ercTokens))[0]).is.contain('USD Coin');
  });

  it("decimals", async () => {
    expect((await util.erc20Decimals(ercTokens))[0]).is.eq(6);
  });

  it("balances", async () => {
    expect((await util.erc20Balances(ercTokens, signer.address))[0]).is.eq(0);
  });

  it("supply", async () => {
    expect((await util.erc20TotalSupply(ercTokens))[0]).is.not.eq(0);
  });

  it("balances_for_addresses_not_0", async() =>{
    expect((await util.erc20BalancesForAddresses(ercTokens[0], addresses))[0]).is.not.eq(0);
  });

  it("balances_for_addresses_is_0", async() =>{
    expect((await util.erc20BalancesForAddresses(ercTokens[0], addresses))[1]).is.eq(0);
  });
});
