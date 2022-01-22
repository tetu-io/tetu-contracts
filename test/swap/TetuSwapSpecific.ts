import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TimeUtils } from '../TimeUtils';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import {
  IUniswapV2Pair,
  TetuSwapFactory,
  TetuSwapRouter,
} from '../../typechain';
import { utils } from 'ethers';
import { CoreContractsWrapper } from '../CoreContractsWrapper';
import { ethers } from 'hardhat';
import { UniswapUtils } from '../UniswapUtils';

const { expect } = chai;
chai.use(chaiAsPromised);

describe('Tetu Swap specific tests', function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let factory: TetuSwapFactory;
  let router: TetuSwapRouter;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    const net = await ethers.provider.getNetwork();
    const coreAddresses = await DeployerUtils.getCoreAddresses();

    factory = (await DeployerUtils.connectInterface(
      signer,
      'TetuSwapFactory',
      coreAddresses.swapFactory,
    )) as TetuSwapFactory;
    router = (await DeployerUtils.connectInterface(
      signer,
      'TetuSwapRouter',
      coreAddresses.swapRouter,
    )) as TetuSwapRouter;
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  // it('swap btc-eth', async () => {
  //   const tokenA = MaticAddresses.WBTC_TOKEN;
  //   const tokenB = MaticAddresses.WETH_TOKEN;
  //
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('200'));
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100'));
  //   const pair = await factory.getPair(tokenA, tokenB);
  //   await (await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', pair) as IUniswapV2Pair).sync()
  //   await UniswapUtils.swapExactTokensForTokens(
  //     signer,
  //     [tokenA, tokenB],
  //     utils.parseUnits("0.000932", 8).toString(),
  //     signer.address,
  //     router.address
  //   );
  // });
});
