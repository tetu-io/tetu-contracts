import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {LiquidityBalancer} from "../../typechain";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../MaticAddresses";
import {MintHelperUtils} from "../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("liquidity balancer tsets", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let liquidityBalancer: LiquidityBalancer;
  let token: string;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user = (await ethers.getSigners())[1];
    core = await DeployerUtils.deployAllCoreContracts(signer);

    token = core.rewardToken.address;

    liquidityBalancer = await DeployerUtils.deployLiquidityBalancer(
        signer, core.controller.address) as LiquidityBalancer;

    await MintHelperUtils.mint(core.controller, core.announcer, '10000000', signer.address);
    await TokenUtils.transfer(core.rewardToken.address, signer,
        liquidityBalancer.address, utils.parseUnits("100000").toString());

    await liquidityBalancer.setTargetPriceUpdateNumerator(1000);
    await liquidityBalancer.setTargetTvlUpdateNumerator(1000);
    await liquidityBalancer.setRemoveLiqRatioNumerator(1000);

    expect(await liquidityBalancer.isGovernance(signer.address)).is.eq(true);

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


  it("should sell tokens", async () => {
    await UniswapUtils.swapNETWORK_COINForExactTokens(
        signer,
        [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN],
        utils.parseUnits("1000000", 6).toString(),
        MaticAddresses.QUICK_ROUTER
    );

    const lp = await UniswapUtils.createPairForRewardToken(signer, core, "1000");

    const lpInfo = await UniswapUtils.getLpInfo(lp, signer, token);
    const tokenStacked = lpInfo[0];
    const oppositeToken = lpInfo[1];
    const oppositeTokenStacked = lpInfo[2];
    const price = lpInfo[3];
    const oppositeTokenDecimals = await TokenUtils.decimals(oppositeToken);

    console.log('INITIAL STATS',
        'tokenStacked: ' + tokenStacked,
        'oppositeToken: ' + oppositeToken,
        'oppositeTokenStacked: ' + oppositeTokenStacked,
        'price: ' + price
    );

    await liquidityBalancer.setRouter(lp, MaticAddresses.QUICK_ROUTER);
    await liquidityBalancer.setTargetLpTvl(lp, utils.parseUnits("10000000"));
    await liquidityBalancer.setTargetPrice(token, utils.parseUnits("0.2"));


    for (let i = 0; i < 10; i++) {
      // buy TargetToken for USDC
      await UniswapUtils.swapExactTokensForTokens(
          signer,
          [MaticAddresses.USDC_TOKEN, token],
          utils.parseUnits("1000", 6).toString(),
          signer.address,
          MaticAddresses.QUICK_ROUTER
      );

      const targetPrice = +utils.formatUnits(await liquidityBalancer.priceTargets(token));
      console.log('targetPrice', targetPrice);

      const lpInfoBefore = await UniswapUtils.getLpInfo(lp, signer, token);

      await liquidityBalancer.changeLiquidity(core.rewardToken.address, lp);

      const lpInfoAfter = await UniswapUtils.getLpInfo(lp, signer, token);
      const priceAfter = lpInfoAfter[3];
      expect(priceAfter).is.approximately(targetPrice, targetPrice * 0.01, 'target price was not reached')

      compareLpInfo(lpInfoBefore, lpInfoAfter, false);
    }
  });


  it("should remove liquidity and buyback", async () => {
    await UniswapUtils.swapNETWORK_COINForExactTokens(
        signer,
        [MaticAddresses.WMATIC_TOKEN, MaticAddresses.USDC_TOKEN],
        utils.parseUnits("1000000", 6).toString(),
        MaticAddresses.QUICK_ROUTER
    );

    const lp = await UniswapUtils.createPairForRewardToken(signer, core, "1000");

    // buy TargetToken for USDC
    await UniswapUtils.swapExactTokensForTokens(
        signer,
        [MaticAddresses.USDC_TOKEN, token],
        utils.parseUnits("1000", 6).toString(),
        signer.address,
        MaticAddresses.QUICK_ROUTER
    );

    const lpContract = await UniswapUtils.connectLpContract(lp, signer);
    const lpDecimals = await lpContract.decimals();
    console.log('lpDecimals', lpDecimals);

    const lpInfo = await UniswapUtils.getLpInfo(lp, signer, token);
    const tokenStacked = lpInfo[0];
    const oppositeToken = lpInfo[1];
    const oppositeTokenStacked = lpInfo[2];
    const price = lpInfo[3];
    const oppositeTokenDecimals = await TokenUtils.decimals(oppositeToken);

    console.log('INITIAL STATS',
        'tokenStacked: ' + tokenStacked,
        'oppositeToken: ' + oppositeToken,
        'oppositeTokenStacked: ' + oppositeTokenStacked,
        'price: ' + price
    );

    await liquidityBalancer.setRouter(lp, MaticAddresses.QUICK_ROUTER);

    await liquidityBalancer.setTargetPrice(token, utils.parseUnits("0.2"));

    // need to sell some tokens for adding LP tokens
    await liquidityBalancer.setTargetLpTvl(lp, utils.parseUnits("100000000"));
    await liquidityBalancer.changeLiquidity(core.rewardToken.address, lp);
    await liquidityBalancer.setTargetLpTvl(lp, utils.parseUnits("2134"));
    await liquidityBalancer.setTargetPrice(token, utils.parseUnits("100000000"));

    console.log("###################### START LOOPS #####################");
    for (let i = 0; i < 2; i++) {
      const targetPrice = +utils.formatUnits(await liquidityBalancer.priceTargets(token));
      console.log('targetPrice', targetPrice);
      const targetTvl = +utils.formatUnits(await liquidityBalancer.lpTvlTargets(lp));
      console.log('targetTvl', targetTvl);

      const lpInfoBefore = await UniswapUtils.getLpInfo(lp, signer, token);

      const sellAmount = Math.max((lpInfoBefore[0] * 0.01), 100);
      const lpTokenBalance = +utils.formatUnits(await TokenUtils.balanceOf(lp, liquidityBalancer.address), lpDecimals);
      console.log('lpTokenBalance', lpTokenBalance);
      const remAmount = (lpTokenBalance * 0.1);
      console.log('sellAmount', sellAmount, 'remAmount', remAmount);

      await liquidityBalancer.changeLiquidity(core.rewardToken.address, lp);

      const lpInfoAfter = await UniswapUtils.getLpInfo(lp, signer, token);

      const tvlAfter = lpInfoAfter[2] * 2;
      // expect(tvlAfter).is.approximately(targetTvl, 0.01, 'target tvl did not reach');

      compareLpInfo(lpInfoBefore, lpInfoAfter, true);

      // buy TargetToken for USDC
      await UniswapUtils.swapExactTokensForTokens(
          signer,
          [MaticAddresses.USDC_TOKEN, token],
          utils.parseUnits("1000", 6).toString(),
          signer.address,
          MaticAddresses.QUICK_ROUTER
      );
    }
  });

  it("should salvage", async () => {
    const balanceBefore = await TokenUtils.balanceOf(token, core.controller.address);
    await liquidityBalancer.moveTokensToController(token, '123456789');
    const balanceAfter = await TokenUtils.balanceOf(token, core.controller.address);
    expect(+utils.formatUnits(balanceAfter, 18)).is.eq(+utils.formatUnits(balanceBefore.add('123456789'), 18));
  });

  it("should not down with zero values", async () => {
    const lp = await UniswapUtils.createPairForRewardToken(
        signer, core, "1000");
    await liquidityBalancer.setTargetPrice(token, utils.parseUnits("1"));
    await liquidityBalancer.setTargetLpTvl(lp, utils.parseUnits("1"));
    await liquidityBalancer.changeLiquidity(token, lp);
  });
});


function compareLpInfo(before: [number, string, number, number], after: [number, string, number, number], priceShouldIncrease: boolean) {

  const tokenStacked = after[0] - before[0];
  const oppositeTokenStacked = after[2] - before[2];
  const price = (after[3] - before[3]) / before[3] * 100;

  console.log('BEFORE',
      'tokenStacked: ' + before[0],
      'oppositeTokenStacked: ' + before[2],
      'price: ' + before[3]
  );

  console.log('AFTER ',
      'tokenStacked: ' + after[0],
      'oppositeTokenStacked: ' + after[2],
      'price: ' + after[3]
  );

  console.log(
      'change tokenStacked: ' + tokenStacked,
      'change oppositeTokenStacked: ' + oppositeTokenStacked,
      'change price: ' + price + '%'
  );
  expect(price).is.not.eq(0, 'price doesnt change');
  expect(price > 0).is.eq(priceShouldIncrease, 'price changed wrong ' + price);
}
