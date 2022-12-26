import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {ToolsAddresses} from "../../scripts/models/ToolsAddresses";
import {
  Controller,
  IBVault,
  MockChildToken__factory,
  SmartVault,
  ZapTetuBal, ZapTetuBalHelper
} from "../../typechain";
import {parseUnits} from "ethers/lib/utils";
import fetch from "node-fetch";
import {BytesLike} from "@ethersproject/bytes";
import {BigNumber, ethers} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Zap tetuBAL test", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let tools: ToolsAddresses;
  let zapLsBpt: ZapTetuBal;
  let controller: Controller;
  let vault: SmartVault;
  let balVault: IBVault;
  let poolId: BytesLike;
  let helper: ZapTetuBalHelper;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    snapshot = await TimeUtils.snapshot();

    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    core = await DeployerUtils.getCoreAddresses();
    tools = await DeployerUtils.getToolsAddresses();

    zapLsBpt = await DeployerUtils.deployContract(signer, "ZapTetuBal", core.controller) as ZapTetuBal;
    controller = await DeployerUtils.connectContract(signer, 'Controller', core.controller) as Controller;
    vault = await DeployerUtils.connectInterface(signer, 'SmartVault', await zapLsBpt.TETU_VAULT()) as SmartVault;

    await controller.changeWhiteListStatus([zapLsBpt.address], true);

    balVault = await DeployerUtils.connectInterface(signer, 'contracts/third_party/balancer/IBVault.sol:IBVault', await zapLsBpt.BALANCER_VAULT()) as IBVault;

    poolId = await zapLsBpt.BALANCER_POOL_ID();

    helper = await DeployerUtils.deployContract(signer, "ZapTetuBalHelper") as ZapTetuBalHelper;
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });

  it("Zap in/out 5 USDC", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    const tokenIn = MaticAddresses.USDC_TOKEN;
    const amount = parseUnits('5', 6);

    await TokenUtils.getToken(tokenIn, signer.address, amount);

    await TokenUtils.approve(tokenIn, signer, zapLsBpt.address, amount.toString())

    // get 1inch swap data for swap tokenIn to asset0
    let params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: MaticAddresses.WETH_TOKEN,
      amount: amount.mul(2).div(10).toString(),
      fromAddress: zapLsBpt.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
    };

    let swapQuoteAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn asset0: ', swapQuoteAsset0.tx);

    // get 1inch swap data for swap tokenIn to asset1
    params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: MaticAddresses.BAL_TOKEN,
      amount: amount.mul(8).div(10).toString(),
      fromAddress: zapLsBpt.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
    };

    let swapQuoteAsset1 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn to asset1: ', swapQuoteAsset1.tx);

    const quoteOutShared = await helper.callStatic.quoteInSharedAmount(BigNumber.from(swapQuoteAsset0.toTokenAmount), BigNumber.from(swapQuoteAsset1.toTokenAmount))
    console.log('Quote out shared', quoteOutShared)

    await zapLsBpt.zapInto(
      tokenIn,
      swapQuoteAsset0.tx.data,
      swapQuoteAsset1.tx.data,
      amount
    );

    const vaultBalance = await vault.balanceOf(signer.address);
    expect(vaultBalance).to.be.gt(quoteOutShared.sub(quoteOutShared.div(100))) // 1% slippage
    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.eq(0)

    await TokenUtils.approve(vault.address, signer, zapLsBpt.address, vaultBalance.toString())

    // quote amounts to build 1inch swap data
    const amountsOut = await zapLsBpt.callStatic.quoteOutAssets(vaultBalance);

    // get 1inch swap data for swap asset0 to tokenIn
    params = {
      fromTokenAddress: MaticAddresses.WETH_TOKEN,
      toTokenAddress: tokenIn,
      amount: amountsOut[0].toString(),
      fromAddress: zapLsBpt.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
    };

    swapQuoteAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap asset0 to tokenIn: ', swapQuoteAsset0);

    // get 1inch swap data for swap asset1 to tokenIn
    params = {
      fromTokenAddress: MaticAddresses.BAL_TOKEN,
      toTokenAddress: tokenIn,
      amount: amountsOut[1].toString(),
      fromAddress: zapLsBpt.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
    };

    swapQuoteAsset1 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap asset1 to tokenIn: ', swapQuoteAsset1);

    await zapLsBpt.zapOut(
      tokenIn,
      swapQuoteAsset0.tx.data,
      swapQuoteAsset1.tx.data,
      vaultBalance
    );

    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.be.gt(amount.mul(95).div(100))
  });

  it("Zap in/out BAL", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    const tokenIn = MaticAddresses.BAL_TOKEN;
    const amount = parseUnits('50', 18);

    await TokenUtils.getToken(tokenIn, signer.address, amount);

    const signerTokenInBalanceBefore = await TokenUtils.balanceOf(tokenIn, signer.address)

    await TokenUtils.approve(tokenIn, signer, zapLsBpt.address, amount.toString())

    // get 1inch swap data for swap tokenIn to asset0
    let params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: MaticAddresses.WETH_TOKEN,
      amount: amount.mul(2).div(10).toString(),
      fromAddress: zapLsBpt.address,
      slippage: 10,
      disableEstimate: true,
      allowPartialFill: false,
    };

    let swapQuoteAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn asset0: ', swapQuoteAsset0.tx);

    await zapLsBpt.zapInto(
      tokenIn,
      swapQuoteAsset0.tx.data,
      '0x00',
      amount
    );

    const vaultBalance = await vault.balanceOf(signer.address);
    expect(vaultBalance).to.be.gt(0)
    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.eq(signerTokenInBalanceBefore.sub(amount))

    await TokenUtils.approve(vault.address, signer, zapLsBpt.address, vaultBalance.toString())

    // quote amounts to build 1inch swap data
    const amountsOut = await zapLsBpt.callStatic.quoteOutAssets(vaultBalance);

    // get 1inch swap data for swap asset0 to tokenIn
    params = {
      fromTokenAddress: MaticAddresses.WETH_TOKEN,
      toTokenAddress: tokenIn,
      amount: amountsOut[0].toString(),
      fromAddress: zapLsBpt.address,
      slippage: 10,
      disableEstimate: true,
      allowPartialFill: false,
    };

    swapQuoteAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap asset0 to tokenIn: ', swapQuoteAsset0);

    await zapLsBpt.zapOut(
      tokenIn,
      swapQuoteAsset0.tx.data,
      '0x00',
      vaultBalance
    );

    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.be.gt(amount.mul(95).div(100))
  });

  it("Zap in 2m BAL", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    let poolBalances = (await balVault.getPoolTokens(poolId))[1]
    const tetuBalInPoolBefore: BigNumber = poolBalances[1]
    console.log('Balancer pool balances before:', poolBalances)

    const tokenIn = MaticAddresses.BAL_TOKEN;
    const amount = parseUnits('2000000', 18);

    // await TokenUtils.getToken(tokenIn, signer.address, amount);
    // not enough BAL on top holder balance

    // mint as bridge DEPOSITOR_ROLE address
    const balDepositor = await DeployerUtils.impersonate('0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa');
    const token = await MockChildToken__factory.connect(tokenIn, balDepositor);
    const packedAmount = ethers.utils.solidityPack([ "uint256" ], [ amount.toString() ])
    await token.deposit(signer.address, packedAmount)

    const signerTokenInBalanceBefore = await TokenUtils.balanceOf(tokenIn, signer.address)

    await TokenUtils.approve(tokenIn, signer, zapLsBpt.address, amount.toString())

    // get 1inch swap data for swap tokenIn to asset0
    const params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: MaticAddresses.WETH_TOKEN,
      amount: amount.mul(2).div(10).toString(),
      fromAddress: zapLsBpt.address,
      slippage: 10,
      disableEstimate: true,
      allowPartialFill: false,
      protocols: 'POLYGON_UNISWAP_V3,POLYGON_BALANCER_V2',
    };

    const swapQuoteAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn asset0: ', swapQuoteAsset0.tx);

    await zapLsBpt.zapInto(
      tokenIn,
      swapQuoteAsset0.tx.data,
      '0x00',
      amount
    );

    const vaultBalance = await vault.balanceOf(signer.address);
    expect(vaultBalance).to.be.gt(0)
    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.eq(signerTokenInBalanceBefore.sub(amount))

    poolBalances = (await balVault.getPoolTokens(poolId))[1]
    console.log('Balancer pool balances after:', poolBalances)
    // after this test balancer pool become balanced
    /*Balancer pool balances after: [
      BigNumber { value: "560634593238713782173626" },
      BigNumber { value: "560634593238713782173626" }
    ]*/

    // check that new tetuBAL was minted
    expect(poolBalances[1]).to.be.gt(tetuBalInPoolBefore)
  });
})

function apiRequestUrl(methodName: string, queryParams: string) {
  const chainId = 137;
  const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
  const r = (new URLSearchParams(JSON.parse(queryParams))).toString();
  return apiBaseUrl + methodName + '?' + r;
}

async function buildTxForSwap(params: string) {
  const url = apiRequestUrl('/swap', params);
  console.log('url', url)
  return fetch(url).then(res => {
    // console.log('res', res)
    return res.json();
  })/*.then(res => res.tx)*/;
}