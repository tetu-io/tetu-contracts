import {ethers} from 'hardhat';
import {Contract, Event} from 'ethers';
import {expect} from 'chai';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import {IBasePool, IVault, IWeightedPool} from "../../../../typechain";
import {BytesLike} from "@ethersproject/bytes";
import {MaticAddresses} from "../../../MaticAddresses";
import {bn, fp} from "./helpers/numbers";
import {MAX_UINT256} from "./helpers/constants";
import {formatFixed} from '@ethersproject/bignumber';
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {Result} from "@ethersproject/abi";


async function deployPoolWithFactory(vault: IVault, singer: SignerWithAddress): Promise<IBasePool> {
  const NAME = 'Three-token Test Weighted Pool';
  const SYMBOL = '60WMATIC-20BTC-20WETH';
  const swapFeePercentage = 0.5e16; // 0.5%
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const WEIGHTED_POOL_FACTORY = '0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9';

  const factory = await ethers.getContractAt('IWeightedPoolFactory', WEIGHTED_POOL_FACTORY, singer);
  const tokens = [MaticAddresses.WMATIC_TOKEN, MaticAddresses.WBTC_TOKEN, MaticAddresses.WETH_TOKEN];
  const weights = [fp(0.6), fp(0.2), fp(0.2)];
  const tx = await factory.create(NAME, SYMBOL, tokens, weights,
    swapFeePercentage, ZERO_ADDRESS);
  const receipt = await tx.wait();

  // We need to get the new pool address out of the PoolCreated event
  // Some wired coding to satisfy ts.
  const _events = receipt.events as Event[]
  const events = _events.filter((e: Event) => e.event === 'PoolCreated');
  const _args = events[0].args as Result
  const poolAddress = _args.pool;

  // We're going to need the PoolId later, so ask the contract for it
  const pool = await ethers.getContractAt('IWeightedPool', poolAddress) as IWeightedPool;
  console.log("Pool deployed");
  return pool;
}

const setup = async () => {
  const [signer] = (await ethers.getSigners());

  // Connect to balancer vault
  const vault = await ethers.getContractAt(
    "IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8") as IVault;

  // Deploy Pool
  const pool = await deployPoolWithFactory(vault, signer);
  const poolId = await pool.getPoolId();

  console.log('############## Preparations completed ##################');

  return {
    data: {
      poolId,
    },
    contracts: {
      pool,
      vault,
    },
  };
};


describe('Balancer WeightedPool', function () {
  let vault: IVault;
  let pool: Contract;
  let poolId: BytesLike;
  let singer: SignerWithAddress;
  let investor: SignerWithAddress;
  let other: SignerWithAddress;

  before('Get user to act', async () => {
    [singer, investor, other] = await ethers.getSigners();
  });

  beforeEach('set up asset manager', async () => {
    const {contracts, data} = await setup();
    vault = contracts.vault;
    pool = contracts.pool;
    poolId = data.poolId;
  });

  describe('WeightedPool initialization', () => {
    it('Happy path', async () => {
      const poolTokens = (await vault.getPoolTokens(poolId)).tokens;
      const initialBalances = [bn(20000000000), bn(1000000), bn(40000000)];
      const JOIN_KIND_INIT = 0;

      const initUserData =
        ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256[]'],
          [JOIN_KIND_INIT, initialBalances]);

      // swap tokens to invest
      await StrategyTestUtils.buyAndApproveTokens(
        [MaticAddresses.WMATIC_TOKEN, MaticAddresses.WBTC_TOKEN, MaticAddresses.WETH_TOKEN],
        [100000000, 10000, 10000],
        singer, vault.address);

      await vault.joinPool(poolId, singer.address, singer.address, {
        assets: poolTokens,
        maxAmountsIn: poolTokens.map(() => MAX_UINT256),
        fromInternalBalance: false,
        userData: initUserData,
      });

      const {balances} = await vault.getPoolTokens(poolId);
      expect(balances[0]).to.be.eq(bn(20000000000));
      expect(balances[1]).to.be.eq(bn(1000000));
      expect(balances[2]).to.be.eq(bn(40000000));

      console.log(`The pool now holds:`);
      poolTokens.forEach((token, i) => {
        console.log(`  ${token}: ${formatFixed(balances[i], 18)}`);
      });
      const bpt = await pool.balanceOf(singer.address);
      expect(bpt).to.be.gt(0);
      console.log(`Pool initiator received ${formatFixed(bpt, 18)} (BPT) in return`);
    });
  });
});
