// WARNING!:
// Run this test on Matic network first - to build token swap route data
// Because it runs too long at forked network
// Then run at fork - to test swaps itself
// Do not forget to update fork block to have same state with network

import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwap2,
} from "../../typechain";
import {ethers, network, config} from "hardhat";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

import {TokenUtils} from "../TokenUtils";
import {BigNumber, BigNumberish} from "ethers";
import {MaxUint256} from '@ethersproject/constants';


import testJson from './json/MultiSwap2TestData.json';
// import hardhatConfig from "../../hardhat.config";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {TimeUtils} from "../TimeUtils";
import {parseUnits} from "ethers/lib/utils";


// const {expect} = chai;
chai.use(chaiAsPromised);

const _SLIPPAGE_DENOMINATOR = 10000;

interface ISwapV2 {
  poolId: string;
  assetInIndex: number;
  assetOutIndex: number;
  amount: BigNumberish;
  userData: string;
}

interface ISwapInfo {
  swapData: ISwapData;
  tokenAddresses: string[];
  swaps: ISwapV2[];
  swapAmount: BigNumberish;
  swapAmountForSwaps?: BigNumberish; // Used with stETH/wstETH
  returnAmount: BigNumberish;
  returnAmountFromSwaps?: BigNumberish; // Used with stETH/wstETH
  returnAmountConsideringFees: BigNumberish;
  tokenIn: string;
  tokenOut: string;
  marketSp: BigNumberish;
}

interface ISwapData {
  tokenIn: string;
  tokenOut: string;
  swapAmount: BigNumberish;
  returnAmount: BigNumberish;
}

interface ITestData {
  [key: string]: ISwapInfo
}

describe("MultiSwap2 base tests", function () {
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let multiSwap2: MultiSwap2;
  let usdc: string;

  const testData = testJson.testData as unknown as ITestData;

  before(async function () {
    this.timeout(1200000);

    // start hardhat fork from the block number test data generated for
    console.log('Resetting hardhat fork to block Number', testJson.blockNumber);
    await TimeUtils.resetBlockNumber(config.networks.hardhat.forking?.url, testJson.blockNumber);

    const latestBlock = await ethers.provider.getBlock('latest');
    console.log('latestBlock', latestBlock.number);


    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddresses();

    usdc = await DeployerUtils.getUSDCAddress();

    if (network.name === 'hardhat') {

      const networkToken = await DeployerUtils.getNetworkTokenAddress();
      multiSwap2 = await DeployerUtils.deployContract(
          signer,
          'MultiSwap2',
          core.controller,
          networkToken,
          MaticAddresses.BALANCER_VAULT
      ) as MultiSwap2;

    } else console.error('Unsupported network', network.name)


  })

  describe("errors", async () => {

    const getDeadline = () => {
      return Math.floor(Date.now() / 1000) + 60 * 30;
    }

    const getSwap = () => {
      // return Object.assign({}, testData['100000 USDC->WMATIC']);
      return JSON.parse(JSON.stringify(testData['100000 USDC->WMATIC']));
    }

    const expectSwapRevert = async (swap: ISwapInfo, reason: string, deadline?: number) => {
      return expect(multiSwap2.multiSwap(
          swap.swapData,
          swap.swaps,
          swap.tokenAddresses,
          _SLIPPAGE_DENOMINATOR / 50,
          deadline ?? getDeadline(),
      ))
      .to.be.revertedWith(reason);
    }

    it("MSZeroWETH", async () => {
      return expect(
          DeployerUtils.deployContract(
              signer,
              'MultiSwap2',
              core.controller,
              ethers.constants.AddressZero,
              MaticAddresses.BALANCER_VAULT
          )
      )
      .to.be.revertedWith('MSZeroWETH');
    });

    it("MSZeroBalancerVault", async () => {
      return expect(
          DeployerUtils.deployContract(
              signer,
              'MultiSwap2',
              core.controller,
              await DeployerUtils.getNetworkTokenAddress(),
              ethers.constants.AddressZero,
          )
      )
      .to.be.revertedWith('MSZeroBalancerVault');
    });

    it("MSSameTokens", async () => {
      const swap = getSwap();
      swap.swapData.tokenOut = swap.swapData.tokenIn;
      await expectSwapRevert(swap, 'MSSameTokens');
    });

    it("MSZeroAmount", async () => {
      const swap = getSwap();
      swap.swapData.swapAmount = '0';
      await expectSwapRevert(swap,'MSZeroAmount');
    });

    it("MSUnknownAmountInFirstSwap", async () => {
      const swap = getSwap();
      swap.swaps[0].amount = '0';
      await expectSwapRevert(swap,'MSUnknownAmountInFirstSwap');
    });

    it("MSDeadline", async () => {
      const swap = getSwap();
      await expectSwapRevert(swap,'MSDeadline', 1);
    });

  });


  it("salvage", async () => {
    const amount = parseUnits('1000', 6)
    await TokenUtils.getToken(usdc, signer.address, amount);
    await TokenUtils.transfer(usdc, signer, multiSwap2.address, amount.toString());


    const gov = await DeployerUtils.impersonate();
    const usdBefore = await TokenUtils.balanceOf(usdc, gov.address);
    console.log('usdBefore', usdBefore.toString());
    const tx = await multiSwap2.connect(gov).salvage(usdc, amount);
    await tx.wait(1);
    const usdAfter = await TokenUtils.balanceOf(usdc, gov.address);
    console.log('usdAfter', usdAfter.toString());

    const diff = usdAfter.sub(usdBefore);
    console.log('diff', diff.toString());

    expect(diff).is.eq(amount, 'Amount not salvaged')

  });

  it("do multi swaps", async () => {
    const deadline = MaxUint256;
    const slippage = _SLIPPAGE_DENOMINATOR * 2 / 100; // 2%
    // for (const key of Object.keys(testData)) {
    for (const key of Object.keys(testData).slice(0, 3)) { // TODO remove slice
      console.log('\n-----------------------');
      console.log(key);
      console.log('-----------------------');
      const snapshot = await TimeUtils.snapshot();

      const multiswap = testData[key];

      const tokenIn = multiswap.swapData.tokenIn;
      const tokenOut = multiswap.swapData.tokenOut;
      const amountOutBefore = await TokenUtils.balanceOf(tokenOut, signer.address);
      console.log('amountOutBefore', amountOutBefore.toString());
      const amount = BigNumber.from(multiswap.swapAmount)
      await TokenUtils.getToken(tokenIn, signer.address, amount);
      await TokenUtils.approve(tokenIn, signer, multiSwap2.address, amount.toString());

      await multiSwap2.multiSwap(
        multiswap.swapData,
        multiswap.swaps,
        multiswap.tokenAddresses,
        slippage,
        deadline
      );

      const amountOutAfter = await TokenUtils.balanceOf(tokenOut, signer.address);
      console.log('amountOutAfter', amountOutAfter.toString());
      const amountOut = amountOutAfter.sub(amountOutBefore);
      console.log('amountOut     ', amountOut.toString());
      const amountExpected = multiswap.returnAmount;
      console.log('amountExpected', amountExpected);
      const diff = amountOut.mul(10000).div(amountExpected).toNumber() / 100;
      console.log('diff', diff, '%');

      await TimeUtils.rollback(snapshot);

    }


  })


})
