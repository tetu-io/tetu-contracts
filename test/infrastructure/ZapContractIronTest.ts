import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {
  ContractReader, IIronLpToken, IIronSwap,
  IStrategy,
  IUniswapV2Pair,
  MultiSwap,
  PriceCalculator,
  SmartVault,
  ZapContractIron
} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {Erc20Utils} from "../Erc20Utils";
import {Addresses} from "../../addresses";

const {expect} = chai;
chai.use(chaiAsPromised);

const exclude = new Set<string>([
  '0x21d97B1adcD2A36756a6E0Aa1BAC3Cf6c0943c0E'.toLowerCase(), // wex pear - has transfer fee
  '0xa281C7B40A9634BCD16B4aAbFcCE84c8F63Aedd0'.toLowerCase(), // frax fxs - too high slippage
]);

describe("Zap contract Iron tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;
  let zapContractIron: ZapContractIron;
  let multiSwap: MultiSwap;
  let cReader: ContractReader;

  let is3Usd: SmartVault;
  let is3UsdIron: SmartVault;
  // let iceWeth: SmartVault; // IFireBirdFactory
  // let usdcIce: SmartVault;
  // let iceIron: SmartVault;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);


    calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0] as PriceCalculator;
    multiSwap = await DeployerUtils.deployMultiSwap(signer, core.controller.address, calculator.address);
    zapContractIron = (await DeployerUtils.deployZapContractIron(signer, core.controller.address, multiSwap.address));
    cReader = (await DeployerUtils.deployContractReader(signer, core.controller.address, calculator.address))[0];

    await core.controller.addToWhiteList(zapContractIron.address);

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('1000000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WETH_TOKEN, utils.parseUnits('5000000')); // ~500eth

    await UniswapUtils.createPairForRewardToken(signer, core, '100000');

    console.log('deploying is3Usd');
    is3Usd = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronSwap',
            core.controller.address,
            vaultAddress,
            '0xb4d09ff3dA7f9e9A2BA029cb0A81A989fd7B8f17', // IRON Stableswap 3USD (IS3USD)
            [ '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
              '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
              '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063' ],
            0
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    ))[1];

    console.log('deploying is3UsdIron');
    is3UsdIron = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronSwap',
            core.controller.address,
            vaultAddress,
            '0x985d40fedaa3208dabacdfdca00cbeaac9543949', // IS3USD/IRON
            [ '0xb4d09ff3da7f9e9a2ba029cb0a81a989fd7b8f17',
              '0xd86b5923f3ad7b585ed81b448170ae026c65ae9a' ],
            3
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    ))[1];

    //TODO Move to ZapContractTest as it uses 2 separate tokens, not array
/*    console.log('deploying iceWeth');
    iceWeth = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronUniPair',
            core.controller.address,
            vaultAddress,
            '0xf1ee78544a1118f2efb87f7eacd9f1e6e80e1ea5', // ICE/WETH
            '0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef',
            '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
            1
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    ))[1];

    console.log('deploying usdcIce');
    usdcIce = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronUniPair',
            core.controller.address,
            vaultAddress,
            '0x34832d9ac4127a232c1919d840f7aae0fcb7315b', // USDC/ICE
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            '0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef',
            2
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    ))[1];

    console.log('deploying iceIron');
    iceIron = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyIronUniPair',
            core.controller.address,
            vaultAddress,
            '0x7e2cc09d3d36b3af6edff55b214fd62885234e95', // ICE/IRON
            '0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef',
            '0xd86b5923f3ad7b585ed81b448170ae026c65ae9a',
            4
        ) as Promise<IStrategy>,
        core.controller,
        core.vaultController,
        core.psVault.address,
        signer
    ))[1];*/


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
    const bal = await Erc20Utils.balanceOf(MaticAddresses.WMATIC_TOKEN, signer.address);
    const amount = utils.parseUnits('1');
    await Erc20Utils.transfer(MaticAddresses.WMATIC_TOKEN, signer, zapContractIron.address, amount.toString());
    expect(await Erc20Utils.balanceOf(MaticAddresses.WMATIC_TOKEN, zapContractIron.address)).is.eq(amount);
    await zapContractIron.salvage(MaticAddresses.WMATIC_TOKEN, amount);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WMATIC_TOKEN, zapContractIron.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WMATIC_TOKEN, signer.address)).is.eq(bal);
  });


  it("should zap IS3USD with usdc", async () => {
    await vaultTest(
        signer,
        cReader,
        multiSwap,
        zapContractIron,
        is3Usd.address,
        MaticAddresses.USDC_TOKEN,
        '1000',
        3
    );
  });

  it("should zap IS3USD/IRON with usdc", async () => {
    await vaultTest(
        signer,
        cReader,
        multiSwap,
        zapContractIron,
        is3UsdIron.address,
        MaticAddresses.USDC_TOKEN,
        '100',
        6 //TODO Often INSUFFICIENT_OUTPUT_AMOUNT for IS3USD at MultiSwap - rewrite to add liq @ IronSwap
    );
  });

  it.skip("should be able to invest to all Iron vaults with few assets", async () => {
    // TODO Deploy first to use zapContractIron address
    const deployedZap = await DeployerUtils.connectInterface(
        signer, 'ZapContractIron',
        Addresses.TOOLS.get('matic')?.zapContractIron as string
    ) as ZapContractIron;

    const deployedMultiSwap = await DeployerUtils.connectInterface(
        signer, 'MultiSwap',
        Addresses.TOOLS.get('matic')?.multiSwap as string
    ) as MultiSwap;

    const contractReader = await DeployerUtils.connectInterface(
        signer, 'ContractReader',
        Addresses.TOOLS.get('matic')?.reader as string
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
      const vaultActive = await contractReader.vaultActive(vault);
      const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
      const strategyName = await vCtr.strategy();
      const platform = await contractReader.strategyPlatform(strategyName);
      if ( (await contractReader.strategyAssets(strategyName)).length < 1
          || platform != 5  //TODO how to import constant from? IStrategy.Platform.IRON
          || exclude.has(vault.toLowerCase()) || !vaultActive ) {
        continue;
      }

      // await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('10'));
      await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10'));

      await vaultTest(
          signer,
          contractReader,
          deployedMultiSwap,
          deployedZap,
          vault,
          MaticAddresses.WMATIC_TOKEN,
          '10',
          3
      );
    }

  });


});

async function zapIntoVault(
    signer: SignerWithAddress,
    multiSwap: MultiSwap,
    zapContractIron: ZapContractIron,
    cReader: ContractReader,
    vault: string,
    tokenIn: string,
    amountRaw = '1000',
    slippage: number
) {
  const tokenInDec = await Erc20Utils.decimals(tokenIn);
  const amount = utils.parseUnits(amountRaw, tokenInDec);
  expect(+utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec))
  .is.greaterThanOrEqual(+utils.formatUnits(amount, tokenInDec));


  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);
  console.log('assets', assets);

  const tokensOut = [];
  const tokensOutLps = [];

  for (let asset of assets) {
    let lps: string[] = [];
    if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
      lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
      console.log('lps', lps);
    }

    console.log('============')
    for (let lp of lps) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log('lp', await Erc20Utils.tokenSymbol(t0), await Erc20Utils.tokenSymbol(t1));
    }
    console.log('============')

    tokensOut.push(asset);
    tokensOutLps.push(lps);
  }

  await Erc20Utils.approve(tokenIn, signer, zapContractIron.address, amount.toString())
  console.log('approved');

  await zapContractIron.zapIntoIron(
      vault,
      tokenIn,
      tokensOut,
      tokensOutLps,
      amount,
      slippage
  );


  expect(await Erc20Utils.balanceOf(vault, signer.address)).is.not.eq(0);

  const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec);
  console.log('balance after ADD', balanceAfter);
}

async function zapOutVault(
    signer: SignerWithAddress,
    multiSwap: MultiSwap,
    zapContractIron: ZapContractIron,
    cReader: ContractReader,
    vault: string,
    tokenOut: string,
    amountShare: string,
    slippage: number
) {
  const tokenOutDec = await Erc20Utils.decimals(tokenOut);
  const balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tokenOut, signer.address), tokenOutDec)

  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  const assetsLpRoute = [];

  for (let asset of assets) {
    let lps: string[] = [];
    if (tokenOut.toLowerCase() !== asset.toLowerCase()) {
      lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();
    }

    console.log('============')
    for (let lp of lps) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log('lp', await Erc20Utils.tokenSymbol(t0), await Erc20Utils.tokenSymbol(t1));
    }
    console.log('============')

    assetsLpRoute.push(lps);
  }

  await Erc20Utils.approve(vault, signer, zapContractIron.address, amountShare.toString())
  await zapContractIron.zapOutIron(
      vault,
      tokenOut,
      assets,
      assetsLpRoute,
      amountShare,
      slippage
  );

  const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tokenOut, signer.address), tokenOutDec);
  console.log('balance after REMOVE', balanceAfter);
  expect(balanceAfter).is.greaterThan(balanceBefore);
}

async function vaultTest(
    signer: SignerWithAddress,
    cReader: ContractReader,
    multiSwap: MultiSwap,
    zapContractIron: ZapContractIron,
    vaultAddress: string,
    inputToken: string,
    amount: string,
    slippage: number
) {
  const dec = await Erc20Utils.decimals(inputToken);
  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
  const underlying = await vCtr.underlying();
  console.log('underlying', underlying);

  const lpCtr = await DeployerUtils.connectInterface(signer, 'IIronLpToken', underlying) as IIronLpToken;
  const swap = await lpCtr.swap();
  console.log('swap', swap);

  const swapCtr = await DeployerUtils.connectInterface(signer, 'IIronSwap', swap) as IIronSwap;
  const tokens = await swapCtr.getTokens();
  console.log('tokens', tokens);

  const tokenInDec = await Erc20Utils.decimals(inputToken);
  await Erc20Utils.transfer(inputToken, signer, MaticAddresses.SUSHI_ROUTER,
      (await Erc20Utils.balanceOf(inputToken, signer.address))
      .sub(utils.parseUnits(amount, tokenInDec)).toString());

  const balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(inputToken, signer.address), dec);
  console.log('balanceBefore', balanceBefore);

  await zapIntoVault(
      signer,
      multiSwap,
      zapContractIron,
      cReader,
      vaultAddress,
      inputToken,
      amount,
      slippage
  );

  expect(await Erc20Utils.balanceOf(inputToken, zapContractIron.address)).is.eq(0);
  expect(await Erc20Utils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  for (let i in tokens) {
    console.log('token', i, tokens[i]);
    expect(await Erc20Utils.balanceOf(tokens[i], zapContractIron.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(tokens[i], multiSwap.address)).is.eq(0);
  }

  expect(await Erc20Utils.balanceOf(underlying, zapContractIron.address)).is.eq(0);
  expect(await Erc20Utils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

  const amountShare = await Erc20Utils.balanceOf(vaultAddress, signer.address);

  await zapOutVault(
      signer,
      multiSwap,
      zapContractIron,
      cReader,
      vaultAddress,
      inputToken,
      amountShare.toString(),
      slippage
  );

  expect(await Erc20Utils.balanceOf(inputToken, zapContractIron.address)).is.eq(0);
  expect(await Erc20Utils.balanceOf(inputToken, multiSwap.address)).is.eq(0);

  for (let i in tokens) {
    console.log('token', i, tokens[i]);
    expect(await Erc20Utils.balanceOf(tokens[i], zapContractIron.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(tokens[i], multiSwap.address)).is.eq(0);
  }

  expect(await Erc20Utils.balanceOf(underlying, zapContractIron.address)).is.eq(0);
  expect(await Erc20Utils.balanceOf(underlying, multiSwap.address)).is.eq(0);

  const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(inputToken, signer.address), dec);
  console.log(balanceBefore, balanceAfter, balanceAfter * ((100 - slippage) / 100));
  expect(balanceAfter)
  .is.greaterThan(balanceBefore * ((100 - slippage) / 100));
}
