// WARNING!:
// Run this test on Matic network first - to build token swap route data
// Because it runs too long at forked network
// Then run at fork - to test swaps itself
// Do not forget to update fork block to have same state with network

import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwap2,
  ERC20TransferFee,
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
  let snapshotForEach: string;

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
          MaticAddresses.BALANCER_VAULT,
          MaticAddresses.TETU_SWAP_FACTORY,
      ) as MultiSwap2;

    } else console.error('Unsupported network', network.name)


  })

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });

  describe("errors", async () => {

    const getDeadline = () => {
      return Math.floor(Date.now() / 1000) + 60 * 30;
    }

    const getSwap = () => {
      return JSON.parse(JSON.stringify(testData['1000000 USDC->WMATIC']));
    }

    async function prepareTokens(swap: ISwapInfo) {
      const amount = BigNumber.from(swap.swapAmount)
      await TokenUtils.getToken(swap.tokenIn, signer.address, amount);
      await TokenUtils.approve(swap.tokenIn, signer, multiSwap2.address, amount.toString());
    }

    const expectSwapRevert = async (swap: ISwapInfo, reason: string, deadline?: number) => {
      return expect(multiSwap2.multiSwap(
          swap.swapData,
          swap.swaps,
          swap.tokenAddresses,
          _SLIPPAGE_DENOMINATOR / 20,
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
              MaticAddresses.BALANCER_VAULT,
              MaticAddresses.TETU_SWAP_FACTORY,
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
              MaticAddresses.TETU_SWAP_FACTORY,
          )
      )
      .to.be.revertedWith('MSZeroBalancerVault');
    });

    it("MSZeroTetuFactory", async () => {
      return expect(
          DeployerUtils.deployContract(
              signer,
              'MultiSwap2',
              core.controller,
              await DeployerUtils.getNetworkTokenAddress(),
              MaticAddresses.BALANCER_VAULT,
              ethers.constants.AddressZero,
          )
      )
      .to.be.revertedWith('MSZeroTetuFactory');
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
      await expectSwapRevert(swap,'MSDeadline', 0);
    });

    it("MSMalconstructedMultiSwap", async () => {
      const swap = getSwap();
      swap.swaps[2].assetInIndex = 0;
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSMalconstructedMultiSwap');
    });

    it("MSAmountOutLessThanRequired", async () => {
      const swap = getSwap();
      swap.swapData.returnAmount = BigNumber.from(swap.swapData.returnAmount).mul(2).toString();
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSAmountOutLessThanRequired');
    });

    it("MSSameTokens", async () => {
      const swap = getSwap();
      swap.swapData.tokenOut = swap.swapData.tokenIn;
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSSameTokens');
    });

    it("MSSameTokensInSwap", async () => {
      const swap = getSwap();
      swap.swaps[0].assetOutIndex = swap.swaps[0].assetInIndex ;
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSSameTokensInSwap');
    });

    it("MSWrongTokens (uniswap)", async () => {
      const swap = getSwap();
      // set token index to another, that do not support by pair
      swap.swaps[0].assetOutIndex = Math.max(swap.swaps[0].assetInIndex, swap.swaps[0].assetOutIndex) + 1;
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSWrongTokens');
    });

    it("MSWrongTokens (dystopia)", async () => {
      const swap = JSON.parse(JSON.stringify(testData['1000 USDC->DYST']));

      // set token index to another, that do not support by pair
      swap.swaps[1].assetOutIndex = 0;
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSWrongTokens');
    });

    it("MSForbidden", async () => {
      return expect(
          multiSwap2.salvage(usdc,1)
      )
      .to.be.revertedWith('MSForbidden');
    });

    it("MSTransferFeesForbiddenForOutputToken", async () => {
      const signerERC = await DeployerUtils.impersonate();
      const tf = await DeployerUtils.deployContract(signerERC, 'ERC20TransferFee') as ERC20TransferFee;

      const swap = getSwap();
      const amountToMint = BigNumber.from(swap.returnAmount);
      await tf.mint(multiSwap2.address, amountToMint);
      swap.swapData.tokenOut = tf.address
      await prepareTokens(swap);
      await expectSwapRevert(swap,'MSTransferFeesForbiddenForOutputToken');
    });

    it("MSTransferFeesForbiddenForInputToken", async () => {
      const swap = getSwap();
      const tf = await DeployerUtils.deployContract(signer, 'ERC20TransferFee') as ERC20TransferFee;
      const amount = BigNumber.from(swap.swapAmount);
      const amountToMint = amount.mul(2);
      await tf.mint(signer.address, amountToMint);
      swap.swapData.tokenIn = tf.address
      await TokenUtils.approve(swap.swapData.tokenIn, signer, multiSwap2.address, amount.toString());
      await expectSwapRevert(swap,'MSTransferFeesForbiddenForInputToken');
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
    for (const key of Object.keys(testData)) {
    // for (const key of Object.keys(testData).slice(0, 5)) {
      console.log('\n-----------------------');
      console.log(key);
      console.log('-----------------------');
      const snapshot = await TimeUtils.snapshot();

      const multiswap = testData[key];

      const tokenIn = multiswap.swapData.tokenIn;
      const tokenOut = multiswap.swapData.tokenOut;
      const amountOutBefore = await TokenUtils.balanceOf(tokenOut, signer.address);

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

      const amountOut = amountOutAfter.sub(amountOutBefore);
      console.log('amountOut     ', amountOut.toString());
      const amountExpected = multiswap.returnAmount;
      console.log('amountExpected', amountExpected);
      const diff = amountOut.mul(10000).div(amountExpected).toNumber() / 100 - 100;
      console.log('diff', diff.toFixed(4), '%');

      await TimeUtils.rollback(snapshot);

    }

  })

})
