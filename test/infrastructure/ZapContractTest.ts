import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {
  ContractReader,
  IUniswapV2Pair,
  MultiSwap,
  PriceCalculator,
  SmartVault,
  ZapContract
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

const exclude = new Set<string>([
  '0x21d97B1adcD2A36756a6E0Aa1BAC3Cf6c0943c0E'.toLowerCase(), // wex pear - has transfer fee
  '0xa281C7B40A9634BCD16B4aAbFcCE84c8F63Aedd0'.toLowerCase(), // frax fxs - too high slippage
]);

describe("Zap contract tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;
  let zapContract: ZapContract;
  let multiSwap: MultiSwap;
  let cReader: ContractReader;
  // let grtEthVault: SmartVault;
  // let wmaticEthVault: SmartVault;
  // let btcWexVault: SmartVault;
  // let wexPearVault: SmartVault;
  // let wexVault: SmartVault;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    user = (await ethers.getSigners())[1];
    signer = await DeployerUtils.impersonate();
    // core = await DeployerUtils.getCoreAddressesWrapper(signer);
    core = await DeployerUtils.deployAllCoreContracts(signer);


    calculator = (await DeployerUtils.deployPriceCalculator(signer, core.controller.address))[0] as PriceCalculator;
    multiSwap = await DeployerUtils.deployMultiSwap(signer, core.controller.address, calculator.address);
    zapContract = (await DeployerUtils.deployZapContract(signer, core.controller.address, multiSwap.address));
    cReader = (await DeployerUtils.deployContractReader(signer, core.controller.address, calculator.address))[0];

    await core.controller.changeWhiteListStatus([zapContract.address], true);
    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(usdc, user.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));

    await UniswapUtils.createPairForRewardToken(user, core, '10000');

    // grtEthVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategySushiSwapLp',
    //     core.controller.address,
    //     vaultAddress,
    //     '0x1cedA73C034218255F50eF8a2c282E6B4c301d60', // grt weth
    //     MaticAddresses.GRT_TOKEN,
    //     MaticAddresses.WETH_TOKEN,
    //     16
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];

    // wmaticEthVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategySushiSwapLp',
    //     core.controller.address,
    //     vaultAddress,
    //     '0xc4e595acDD7d12feC385E5dA5D43160e8A0bAC0E', // SUSHI_WMATIC_WETH
    //     MaticAddresses.WMATIC_TOKEN,
    //     MaticAddresses.WETH_TOKEN,
    //     0
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];
    //
    // btcWexVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategyWaultLp',
    //     core.controller.address,
    //     vaultAddress,
    //     '0xaE183DB956FAf760Aa29bFcfDa4BDDdB02fbdd0E', // btc wex lp
    //     MaticAddresses.WBTC_TOKEN,
    //     MaticAddresses.WEXpoly_TOKEN,
    //     24
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];
    //
    // wexPearVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategyWaultLp',
    //     core.controller.address,
    //     vaultAddress,
    //     '0xcF35da701ffD92027f798fF7D28B4CB3b424111d', // pear wex lp
    //     MaticAddresses.PEAR_TOKEN,
    //     MaticAddresses.WEXpoly_TOKEN,
    //     26
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];
    //
    // grtEthVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategySushiSwapLp',
    //     core.controller.address,
    //     vaultAddress,
    //     '0x1cedA73C034218255F50eF8a2c282E6B4c301d60', // grt weth
    //     MaticAddresses.GRT_TOKEN,
    //     MaticAddresses.WETH_TOKEN,
    //     16
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];
    //
    // wexVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
    //   't',
    //   async vaultAddress => DeployerUtils.deployContract(
    //     signer,
    //     'StrategyWaultSingle',
    //     core.controller.address,
    //     vaultAddress,
    //     MaticAddresses.WEXpoly_TOKEN,
    //     1
    //   ) as Promise<IStrategy>,
    //   core.controller,
    //   core.vaultController,
    //   core.psVault.address,
    //   signer
    // ))[1];

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

  it("salvage tokens", async () => {
    const bal = await TokenUtils.balanceOf(usdc, signer.address);
    const amount = utils.parseUnits('1', 6);
    await TokenUtils.transfer(usdc, signer, zapContract.address, amount.toString());
    expect(await TokenUtils.balanceOf(usdc, zapContract.address)).is.eq(amount);
    await zapContract.salvage(usdc, amount);
    expect(await TokenUtils.balanceOf(usdc, zapContract.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(usdc, signer.address)).is.eq(bal);
  });

  // it("should zap wmaticEthVault with eth", async () => {
  //   await vaultLpTest(
  //     user,
  //     cReader,
  //     multiSwap,
  //     zapContract,
  //     wmaticEthVault.address,
  //     usdc,
  //     '0.1',
  //     1
  //   );
  // });
  //
  // it("should zap wmaticEthVault with btc", async () => {
  //   await UniswapUtils.getTokenFromHolder(user, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100'), MaticAddresses.WETH_TOKEN);
  //   await vaultLpTest(
  //     user,
  //     cReader,
  //     multiSwap,
  //     zapContract,
  //     wmaticEthVault.address,
  //     MaticAddresses.WBTC_TOKEN,
  //     '0.001',
  //     1
  //   );
  // });
  it("should zap ps with usdc", async () => {
    await vaultSingleTest(
      user,
      cReader,
      multiSwap,
      zapContract,
      core.psVault.address,
      usdc,
      '10',
      3
    );
  });

  it.skip("should be able to invest to all vaults with 2 assets", async () => {

    const deployedZap = await DeployerUtils.connectInterface(
      user, 'ZapContract',
      (await DeployerUtils.getToolsAddresses()).zapContract as string
    ) as ZapContract;

    const deployedMultiSwap = await DeployerUtils.connectInterface(
      user, 'MultiSwap',
      (await DeployerUtils.getToolsAddresses()).multiSwap as string
    ) as MultiSwap;

    const contractReader = await DeployerUtils.connectInterface(
      user, 'ContractReader',
      (await DeployerUtils.getToolsAddresses()).reader as string
    ) as ContractReader;

    const vaults = await contractReader.vaults();
    console.log('vaults', vaults.length);

    // let num = 0;
    // for (let v of vaults) {
    //   console.log(num, await contractReader.vaultName(v));
    //   num++;
    // }

    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i];
      console.log(i, await contractReader.vaultName(vault));
      const vCtr = await DeployerUtils.connectInterface(user, 'SmartVault', vault) as SmartVault;
      if ((await contractReader.strategyAssets(await vCtr.strategy())).length !== 2
        || exclude.has(vault.toLowerCase())) {
        continue;
      }

      await TokenUtils.getToken(usdc, user.address, utils.parseUnits('10', 6));

      await vaultLpTest(
        user,
        contractReader,
        deployedMultiSwap,
        deployedZap,
        vault,
        usdc,
        '10',
        3
      );
    }

  });


});

async function zapIntoVaultWihSingleToken(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenIn: string,
  amountRaw = '1000',
  slippage: number
) {
  const tokenInDec = await TokenUtils.decimals(tokenIn);
  const amount = utils.parseUnits(amountRaw, tokenInDec);
  expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThanOrEqual(+utils.formatUnits(amount, tokenInDec));


  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);
  expect(assets.length).is.eq(1);

  const asset = assets[0];
  let lps: string[] = [];
  if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
    lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
  }

  console.log('============')
  for (const lp of lps) {
    const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
    const t0 = await lpCtr.token0();
    const t1 = await lpCtr.token1();
    console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
  }
  console.log('============')


  await TokenUtils.approve(tokenIn, signer, zapContract.address, amount.toString())
  await zapContract.connect(signer).zapInto(
    vault,
    tokenIn,
    asset,
    lps,
    amount,
    slippage
  );

  expect(await TokenUtils.balanceOf(vault, signer.address)).is.not.eq(0);

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec);
  console.log('balance after ADD', balanceAfter);
}

async function zapIntoVaultWithLp(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenIn: string,
  amountRaw = '1000',
  slippage: number
) {
  const tokenInDec = await TokenUtils.decimals(tokenIn);
  const amount = utils.parseUnits(amountRaw, tokenInDec);
  expect(+utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec))
    .is.greaterThanOrEqual(+utils.formatUnits(amount, tokenInDec));


  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  const tokensOut = [];
  const tokensOutLps = [];

  for (const asset of assets) {
    let lps: string[] = [];
    if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
      lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
    }

    console.log('============')
    for (const lp of lps) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
    }
    console.log('============')

    tokensOut.push(asset);
    tokensOutLps.push(lps);
  }

  await TokenUtils.approve(tokenIn, signer, zapContract.address, amount.toString())
  await zapContract.connect(signer).zapIntoLp(
    vault,
    tokenIn,
    tokensOut[0],
    tokensOutLps[0],
    tokensOut[1],
    tokensOutLps[1],
    amount,
    slippage
  );


  expect(await TokenUtils.balanceOf(vault, signer.address)).is.not.eq(0);

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec);
  console.log('balance after ADD', balanceAfter);
}

async function zapOutVaultWithSingleToken(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenOut: string,
  amountShare: string,
  slippage: number
) {
  const tokenOutDec = await TokenUtils.decimals(tokenOut);
  const balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(tokenOut, signer.address), tokenOutDec)

  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  expect(assets.length).is.eq(1);

  const asset = assets[0];

  let lps: string[] = [];
  if (tokenOut.toLowerCase() !== asset.toLowerCase()) {
    lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();
  }

  console.log('============')
  for (const lp of lps) {
    const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
    const t0 = await lpCtr.token0();
    const t1 = await lpCtr.token1();
    console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
  }
  console.log('============');


  await TokenUtils.approve(vault, signer, zapContract.address, amountShare.toString())
  await zapContract.connect(signer).zapOut(
    vault,
    tokenOut,
    asset,
    lps,
    amountShare,
    slippage
  );

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenOut, signer.address), tokenOutDec);
  console.log('balance after REMOVE', balanceAfter);
  expect(balanceAfter).is.greaterThan(balanceBefore);
}

async function zapOutVaultWithLp(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenOut: string,
  amountShare: string,
  slippage: number
) {
  const tokenOutDec = await TokenUtils.decimals(tokenOut);
  const balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(tokenOut, signer.address), tokenOutDec)

  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  const assetsLpRoute = [];

  for (const asset of assets) {
    let lps: string[] = [];
    if (tokenOut.toLowerCase() !== asset.toLowerCase()) {
      lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();
    }

    console.log('============')
    for (const lp of lps) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
    }
    console.log('============')

    assetsLpRoute.push(lps);
  }

  await TokenUtils.approve(vault, signer, zapContract.address, amountShare.toString())
  await zapContract.connect(signer).zapOutLp(
    vault,
    tokenOut,
    assets[0],
    assetsLpRoute[0],
    assets[1],
    assetsLpRoute[1],
    amountShare,
    slippage
  );

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenOut, signer.address), tokenOutDec);
  console.log('balance after REMOVE', balanceAfter);
  expect(balanceAfter).is.greaterThan(balanceBefore);
}

async function vaultSingleTest(
  signer: SignerWithAddress,
  cReader: ContractReader,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  vaultAddress: string,
  inputToken: string,
  amount: string,
  slippage: number
) {
  const dec = await TokenUtils.decimals(inputToken);
  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
  const underlying = await vCtr.underlying();

  const tokenInDec = await TokenUtils.decimals(inputToken);
  await TokenUtils.transfer(inputToken, signer, cReader.address,
    (await TokenUtils.balanceOf(inputToken, signer.address))
      .sub(utils.parseUnits(amount, tokenInDec)).toString());

  const balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(inputToken, signer.address), dec);
  console.log('balance xTETU before', await TokenUtils.balanceOf(vaultAddress, signer.address))
  await zapIntoVaultWihSingleToken(
    signer,
    multiSwap,
    zapContract,
    cReader,
    vaultAddress,
    inputToken,
    amount,
    slippage
  );
  console.log('balance xTETU after', await TokenUtils.balanceOf(vaultAddress, signer.address))

  expect(await TokenUtils.balanceOf(inputToken, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(underlying, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

  const amountShare = await TokenUtils.balanceOf(vaultAddress, signer.address);

  await zapOutVaultWithSingleToken(
    signer,
    multiSwap,
    zapContract,
    cReader,
    vaultAddress,
    inputToken,
    amountShare.toString(),
    slippage
  );

  expect(await TokenUtils.balanceOf(inputToken, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(underlying, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(inputToken, signer.address), dec);
  console.log(balanceBefore, balanceAfter, balanceAfter * ((100 - slippage) / 100));
  expect(balanceAfter)
    .is.greaterThan(balanceBefore * ((100 - slippage) / 100));
}

async function vaultLpTest(
  signer: SignerWithAddress,
  cReader: ContractReader,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  vaultAddress: string,
  inputToken: string,
  amount: string,
  slippage: number
) {
  const dec = await TokenUtils.decimals(inputToken);
  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
  const underlying = await vCtr.underlying();

  const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', underlying) as IUniswapV2Pair;

  const token0 = await lpCtr.token0();
  const token1 = await lpCtr.token1();

  const tokenInDec = await TokenUtils.decimals(inputToken);
  const bal = await TokenUtils.balanceOf(inputToken, signer.address);
  console.log('user bal', bal.toString())
  const amountBN = utils.parseUnits(amount, tokenInDec);
  console.log('amount', amountBN.toString())
  // send excess balance
  if (!bal.sub(amountBN).isZero()) {
    await TokenUtils.transfer(inputToken, signer, cReader.address, bal.sub(amountBN).toString());
  }


  const balanceBefore = +utils.formatUnits(await TokenUtils.balanceOf(inputToken, signer.address), dec);

  await zapIntoVaultWithLp(
    signer,
    multiSwap,
    zapContract,
    cReader,
    vaultAddress,
    inputToken,
    amount,
    slippage
  );

  expect(await TokenUtils.balanceOf(inputToken, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(token0, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(token0, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(token1, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(token1, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(underlying, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

  const amountShare = await TokenUtils.balanceOf(vaultAddress, signer.address);

  await zapOutVaultWithLp(
    signer,
    multiSwap,
    zapContract,
    cReader,
    vaultAddress,
    inputToken,
    amountShare.toString(),
    slippage
  );

  expect(await TokenUtils.balanceOf(inputToken, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(token0, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(token0, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(token1, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(token1, multiSwap.address)).is.eq(0);

  expect(await TokenUtils.balanceOf(underlying, zapContract.address)).is.eq(0);
  expect(await TokenUtils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(inputToken, signer.address), dec);
  console.log(balanceBefore, balanceAfter, balanceAfter * ((100 - slippage) / 100));
  expect(balanceAfter)
    .is.greaterThan(balanceBefore * ((100 - slippage) / 100));
}
