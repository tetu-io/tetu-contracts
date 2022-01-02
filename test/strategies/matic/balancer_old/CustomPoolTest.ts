import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {ethers} from "hardhat";
import {TimeUtils} from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IERC20, IVault, MockAssetManagedPool, MockPool, MockRewardsAssetManager} from "../../../../typechain";
import {BigNumber} from "ethers";
import {encodeJoin} from "./helpers/mockPool";
import {MAX_UINT256, PoolSpecialization, ZERO_ADDRESS} from "./helpers/constants";
import {bn, fp, FP_SCALING_FACTOR} from "./helpers/numbers";
import {BytesLike} from "@ethersproject/bytes";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {calcRebalanceAmount, encodeInvestmentConfig} from "./helpers/rebalance";
import * as expectEvent from "./helpers/expectEvent";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {config as dotEnvConfig} from "dotenv";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../../../TokenUtils";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  }
}).argv;

chai.use(chaiAsPromised);

export enum SwapKind {
  GivenIn = 0,
  GivenOut,
}

describe('Balancer AM tests', async () => {
  if (argv.disableStrategyTests) {
    return;
  }
  let snapshotBefore: string;
  let snapshot: string;

  let vault: IVault;
  let poolId: BytesLike;
  let otherUser: SignerWithAddress;
  let pool: MockPool;
  let investor: SignerWithAddress;
  let signer: SignerWithAddress;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, investor, otherUser] = (await ethers.getSigners());

    // Connect to balancer vault
    vault = await ethers.getContractAt(
      "IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8") as IVault;

    // Deploy Pool
    pool = await DeployerUtils.deployContract(
        signer, "MockPool", vault.address, PoolSpecialization.GeneralPool) as MockPool;

    poolId = await pool.getPoolId();

    // await pool.registerTokens([MaticAddresses.WBTC_TOKEN, MaticAddresses.WMATIC_TOKEN], Array(2).fill(ZERO_ADDRESS));

    await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, investor.address, bn(10000000000));
    await TokenUtils.getToken(MaticAddresses.WBTC_TOKEN, investor.address, bn(1000));

    await TokenUtils.approve(MaticAddresses.WMATIC_TOKEN, investor, vault.address, "10000000000");
    await TokenUtils.approve(MaticAddresses.WBTC_TOKEN, investor, vault.address, "1000");

    await TokenUtils.approve(MaticAddresses.WMATIC_TOKEN, investor, pool.address, "10000000000");

    const tokensAddresses = [MaticAddresses.WBTC_TOKEN, MaticAddresses.WMATIC_TOKEN]

    await pool.registerTokens(tokensAddresses, [ZERO_ADDRESS, ZERO_ADDRESS]);

    vault = await ethers.getContractAt(
      "IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8", investor) as IVault;

    const ud = encodeJoin(
      tokensAddresses.map(() => 1),
      tokensAddresses.map(() => 0)
    );

    await vault.joinPool(poolId, investor.address, investor.address, {
      assets: tokensAddresses,
      maxAmountsIn: tokensAddresses.map(() => MAX_UINT256),
      fromInternalBalance: false,
      userData: ud,
    });

    console.log('############## Preparations completed ##################');
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  describe('deployment', () => {
    it('different managers can be set for different tokens', async () => {
      const singleSwap = {
        poolId: await pool.getPoolId(),
        kind: SwapKind.GivenIn,
        assetIn: MaticAddresses.WMATIC_TOKEN,
        assetOut: MaticAddresses.WBTC_TOKEN,
        amount: bn(1000),
        userData: '0x',
      };
      const funds = {
        sender: investor.address,
        fromInternalBalance: false,
        recipient: investor.address,
        toInternalBalance: false,
      };
      const limit = 0; // Minimum amount out
      const deadline = MAX_UINT256;
      const wmaticBefore = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, investor.address);
      console.log("wmaticBefore: ", wmaticBefore.toString())


      const data = await vault.getPoolTokens(poolId);
      const tokens = data.tokens;
      const balances = data.balances;
      console.log("tokens: ", tokens);
      console.log("balance1: ", balances[0].toString());
      console.log("balance2: ", balances[1].toString());

§      await TokenUtils.transfer(MaticAddresses.WMATIC_TOKEN, investor, pool.address, "1000");
      await TokenUtils.transfer(MaticAddresses.WBTC_TOKEN, investor, pool.address, "20");

      await pool.joinPool();

      // await vault.swap(singleSwap, funds, limit, deadline);



      const wmaticAfter = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, investor.address);
      console.log("wmaticAfter: ", wmaticAfter.toString())



      // expect((await vault.getPoolTokenInfo(poolId, MaticAddresses.WBTC_TOKEN)).assetManager).to.equal(assetManager.address);
      // expect((await vault.getPoolTokenInfo(poolId, MaticAddresses.WMATIC_TOKEN)).assetManager).to.equal(otherUser.address);
    });
  });
});



