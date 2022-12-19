import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {ToolsAddresses} from "../../scripts/models/ToolsAddresses";
import {Controller, SmartVault, ZapLSBPT} from "../../typechain";
import {parseUnits} from "ethers/lib/utils";
import fetch from "node-fetch";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Zap liquid staking Balancer test", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let tools: ToolsAddresses;
  let zapLsBpt: ZapLSBPT;
  let controller: Controller;
  let vault: SmartVault;

  // TETU_ETH-BAL_tetuBAL_BPT_V3
  const vaultAddress = '0xBD06685a0e7eBd7c92fc84274b297791F3997ed3';

  const oneInchRouter = '0x1111111254fb6c44bac0bed2854e76f90643097d';

  before(async function () {
    signer = await DeployerUtils.impersonate();
    snapshot = await TimeUtils.snapshot();

    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    core = await DeployerUtils.getCoreAddresses();
    tools = await DeployerUtils.getToolsAddresses();

    zapLsBpt = await DeployerUtils.deployContract(signer, "ZapLSBPT", core.controller, oneInchRouter) as ZapLSBPT;
    controller = await DeployerUtils.connectContract(signer, 'Controller', core.controller) as Controller;
    vault = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;

    await controller.changeWhiteListStatus([zapLsBpt.address], true);
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

  it("Zap in/out USDC", async () => {
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

    let swapTransactionAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn asset0: ', swapTransactionAsset0);

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

    let swapTransactionAsset1 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap tokenIn to asset1: ', swapTransactionAsset1);

    await zapLsBpt.zapInto(
      vaultAddress,
      tokenIn,
      MaticAddresses.WETH_TOKEN,
      swapTransactionAsset0.data,
      MaticAddresses.BAL_TOKEN,
      swapTransactionAsset1.data,
      amount
    );

    const vaultBalance = await vault.balanceOf(signer.address);
    expect(vaultBalance).to.be.gt(0)
    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.eq(0)

    await TokenUtils.approve(vault.address, signer, zapLsBpt.address, vaultBalance.toString())

    // quote amounts to build 1inch swap data
    const amountsOut = await zapLsBpt.callStatic.quoteOutAssets(vaultAddress,MaticAddresses.WETH_TOKEN,MaticAddresses.BAL_TOKEN,vaultBalance);

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

    swapTransactionAsset0 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap asset0 to tokenIn: ', swapTransactionAsset0);

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

    swapTransactionAsset1 = await buildTxForSwap(JSON.stringify(params));
    console.log('1inch tx for swap asset1 to tokenIn: ', swapTransactionAsset1);

    await zapLsBpt.zapOut(
      vaultAddress,
      tokenIn,
      MaticAddresses.WETH_TOKEN,
      swapTransactionAsset0.data,
      MaticAddresses.BAL_TOKEN,
      swapTransactionAsset1.data,
      vaultBalance
    );

    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.be.gt(amount.mul(95).div(100))
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
  }).then(res => res.tx);
}