import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TimeUtils} from "../TimeUtils";
import {ContractReader, IUniswapV2Pair, MultiSwap, PriceCalculator} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Multi swap tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;
  let multiSwap: MultiSwap;
  let cReader: ContractReader;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = await DeployerUtils.impersonate();
    // core = await DeployerUtils.getCoreAddressesWrapper(signer);
    core = await DeployerUtils.deployAllCoreContracts(signer);

    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));

    calculator = (await DeployerUtils.deployPriceCalculator(signer, core.controller.address))[0] as PriceCalculator;
    multiSwap = await DeployerUtils.deployMultiSwap(signer, core.controller.address, calculator.address);
    cReader = (await DeployerUtils.deployContractReader(signer, core.controller.address, calculator.address))[0];
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

  // it.skip("should swap tokens with route wex to matic", async () => {
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.WAULT_ROUTER, MaticAddresses.WEXpoly_TOKEN, utils.parseUnits('1000', 6), MaticAddresses.USDC_TOKEN);
  //   await tryToSwap(signer, multiSwap, MaticAddresses.WEXpoly_TOKEN, MaticAddresses.WMATIC_TOKEN, '0.1');
  // });
  //
  // it("should swap tokens with route usdc to QI", async () => {
  //   await tryToSwap(signer, multiSwap, MaticAddresses.USDC_TOKEN, MaticAddresses.QI_TOKEN);
  // });
  //
  // it("should swap tokens with route usdc to WEX", async () => {
  //   await tryToSwap(signer, multiSwap, MaticAddresses.USDC_TOKEN, MaticAddresses.WEXpoly_TOKEN);
  // });
  //
  // it("should swap tokens with route btc to qi", async () => {
  //   await UniswapUtils.getTokenFromHolder(signer, MaticAddresses.QUICK_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
  //   await tryToSwap(signer, multiSwap, MaticAddresses.WBTC_TOKEN, MaticAddresses.QI_TOKEN, '0.1');
  // });

  // it("should swap tokens with route usdc to eth", async () => {
  //   await tryToSwap(signer, multiSwap, MaticAddresses.USDC_TOKEN, MaticAddresses.WETH_TOKEN);
  // });

  it("should swap tokens with route wmatic to usdc", async () => {
    await tryToSwap(signer, multiSwap, networkToken, usdc);
  });

  it.skip("should be able to buy all assets", async () => {

    const contractReader = await DeployerUtils.connectInterface(
      signer, 'ContractReader',
      (await DeployerUtils.getToolsAddresses()).reader as string
    ) as ContractReader;

    const strategies = await contractReader.strategies();

    for (const strategy of strategies) {

      const assets = await cReader.strategyAssets(strategy);

      for (const asset of assets) {
        if (asset.toLowerCase() === usdc) {
          continue;
        }
        await tryToSwap(signer, multiSwap, usdc, asset, '10');
      }
    }

  });

});

async function tryToSwap(signer: SignerWithAddress, multiSwap: MultiSwap, tokenIn: string, tokenOut: string, amountRaw = '1000') {
  const tokenInDec = await TokenUtils.decimals(tokenIn);

  const amount = utils.parseUnits(amountRaw, tokenInDec);

  expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThan(+utils.formatUnits(amount, tokenInDec));

  const lps = await multiSwap.findLpsForSwaps(tokenIn, tokenOut);

  console.log('===== PATH =======', await TokenUtils.tokenSymbol(tokenIn), '=>', await TokenUtils.tokenSymbol(tokenOut))
  for (const lp of lps) {
    const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
    const t0 = await lpCtr.token0();
    const t1 = await lpCtr.token1();
    console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
  }
  console.log('============')

  await TokenUtils.approve(tokenIn, signer, multiSwap.address, amount.toString())
  await multiSwap.multiSwap(lps, tokenIn, tokenOut, amount, 9);

  const bal = await TokenUtils.balanceOf(tokenOut, signer.address);
  expect(bal).is.not.eq(0);

  expect(await TokenUtils.balanceOf(tokenOut, signer.address)).is.not.eq(0);
}
