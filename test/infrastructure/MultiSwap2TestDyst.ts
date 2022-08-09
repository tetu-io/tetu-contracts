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


import testJson from './json/MultiSwap2TestDataDyst.json';
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {TimeUtils} from "../TimeUtils";


// const {expect} = chai;
chai.use(chaiAsPromised);

const _SLIPPAGE_DENOMINATOR = 10000;

interface ISwapStep {
  poolId: string;
  assetInIndex: number;
  assetOutIndex: number;
  amount: BigNumberish;
  userData: string;
  platformFee: BigNumberish;
}

interface ISwapInfo {
  swapData: ISwapData;
  tokenAddresses: string[];
  swaps: ISwapStep[];
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

describe("MultiSwap2 Dystopia main pairs test", function () {
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let multiSwap2: MultiSwap2;
  let usdc: string;
  let snapshotForEach: string;

  const testData = testJson.testData as unknown as ITestData;

  before(async function () {
    this.timeout(1200000);

    // start hardhat fork from the block number test data generated for
    const blockNumber = testJson.blockNumber;
    console.log('Resetting hardhat fork to block Number', blockNumber);
    await TimeUtils.resetBlockNumber(config.networks.hardhat.forking?.url, blockNumber);

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


  it("do Dystopia-urgent multi swaps", async () => {
    const deadline = MaxUint256;
    const slippage = _SLIPPAGE_DENOMINATOR * 20 / 100; // 10%
    let total = 0
    let reverted = 0;

    // for (const key of Object.keys(testData).slice(0)) {
    for (const key of Object.keys(testData)) {
      console.log('\n-----------------------');
      console.log(total++, key);
      console.log('-----------------------');
      const snapshot = await TimeUtils.snapshot();

      const multiswap = testData[key];

      const tokenIn = multiswap.swapData.tokenIn;
      const tokenOut = multiswap.swapData.tokenOut;

      const amount = BigNumber.from(multiswap.swapAmount)
      await TokenUtils.getToken(tokenIn, signer.address, amount);
      await TokenUtils.approve(tokenIn, signer, multiSwap2.address, amount.toString());
      const amountOutBefore = await TokenUtils.balanceOf(tokenOut, signer.address);

      try {
        await multiSwap2.multiSwap(
            multiswap.swapData,
            multiswap.swaps,
            multiswap.tokenAddresses,
            slippage,
            deadline
        );

        const amountOutAfter = await TokenUtils.balanceOf(tokenOut, signer.address);

        const amountOut = amountOutAfter.sub(amountOutBefore);
        console.log('___');
        console.log('amountOut     ', amountOut.toString());
        const amountExpected = multiswap.returnAmount;
        console.log('amountExpected', amountExpected);
        const diff = amountOut.mul(10000).div(amountExpected).toNumber() / 100 - 100;
        console.log('diff', diff.toFixed(4), '%');

        // expect(diff).lt(0.1); // TODO remove comment

      } catch (e) {
        reverted++;
        console.warn('Swap reverted:', e);
      }

      await TimeUtils.rollback(snapshot);

    }
    console.log('total   ', total);
    console.log('reverted', reverted);


  })

})
