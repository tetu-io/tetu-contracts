import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers, network} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ContractUtils, IUniswapV2Factory, IUniswapV2Pair} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {FtmAddresses} from "../../scripts/addresses/FtmAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Contract utils tests", function () {
  let snapshot: string;
  let signer: SignerWithAddress;
  let util: ContractUtils;
  let addressWithUsdc: ContractUtils;
  let addressWithoutUsdc: ContractUtils;
  let uniswap2factory: string;

  const ercTokens: string[] = [];
  const addresses: string[] = [];

  const factories: {[network:string]: string} = {
    _137: MaticAddresses.QUICK_FACTORY,
    _250: FtmAddresses.SPOOKY_SWAP_FACTORY,
  }

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
    uniswap2factory = factories['_' + network.config.chainId];
    console.log('uniswap2factory', uniswap2factory);
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

  it("router_is_set", async() =>{
    expect(uniswap2factory).is.not.eq(undefined,
        `please add uniV2 factory for network chainId ${network.config.chainId}`);
  });

  it("loadPairsUniswapV2", async() =>{
    const pairs0 = await util.loadPairsUniswapV2(uniswap2factory, 0, 2);
    const pairs1 = await util.loadPairsUniswapV2(uniswap2factory, 1, 3);
    expect(pairs0.length).is.eq(2);
    expect(pairs1.length).is.eq(3);
    expect(pairs0[1].lp).is.eq(pairs1[0].lp);

    const factoryContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', uniswap2factory) as IUniswapV2Factory;
    const pair0 = await factoryContract.allPairs(0);
    const pair1 = await factoryContract.allPairs(1);
    expect(pairs0[0].lp).is.eq(pair0);
    expect(pairs0[1].lp).is.eq(pair1);
    expect(pairs1[0].lp).is.eq(pair1);

    await expect(util.loadPairsUniswapV2(ethers.constants.AddressZero, 0, 2)).to.be.reverted;
  });

  it("loadPairReserves", async() =>{
    const pairs = await util.loadPairsUniswapV2(uniswap2factory, 0, 2);

    const reserves = await util.loadPairReserves([pairs[0].lp, pairs[1].lp]);
    expect(reserves.length).is.eq(2);

    const pairContract0 = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', pairs[0].lp) as IUniswapV2Pair;
    const reserves0 = await pairContract0.getReserves();
    expect(reserves[0][0]).is.eq(reserves0[0]);
    expect(reserves[0][1]).is.eq(reserves0[1]);

    const pairContract1 = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', pairs[1].lp) as IUniswapV2Pair;
    const reserves1 = await pairContract1.getReserves();
    expect(reserves[1][0]).is.eq(reserves1[0]);
    expect(reserves[1][1]).is.eq(reserves1[1]);

    await expect(util.loadPairReserves([ethers.constants.AddressZero])).to.be.reverted;
    // call to wrong pair contract address
    const nilReserves = await util.loadPairReserves([uniswap2factory])
    expect(nilReserves[0][0]).is.eq(0);
    expect(nilReserves[0][1]).is.eq(0);
  });


});
