import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {
  ContractReader,
  IStrategy,
  IUniswapV2Pair,
  MultiSwap,
  PriceCalculator,
  SmartVault,
  ZapContract
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
]);

describe("Zap contract tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  let calculator: PriceCalculator;
  let zapContract: ZapContract;
  let multiSwap: MultiSwap;
  let cReader: ContractReader;
  let grtEthVault: SmartVault;
  let btcWexVault: SmartVault;
  let wexPearVault: SmartVault;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.deployAllCoreContracts(signer);


    calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0] as PriceCalculator;
    multiSwap = await DeployerUtils.deployMultiSwap(signer, core.controller.address, calculator.address);
    zapContract = (await DeployerUtils.deployZapContract(signer, core.controller.address, multiSwap.address))[0];
    cReader = (await DeployerUtils.deployContractReader(signer, core.controller.address, calculator.address))[0];

    await core.controller.addToWhiteList(zapContract.address);

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('100000000')); // 100m wmatic
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('1000000'));


    grtEthVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategySushiSwapLp',
            core.controller.address,
            vaultAddress,
            '0x1cedA73C034218255F50eF8a2c282E6B4c301d60', // grt weth
            MaticAddresses.GRT_TOKEN,
            MaticAddresses.WETH_TOKEN,
            16
        ) as Promise<IStrategy>,
        core.controller,
        core.psVault.address,
        signer
    ))[1];

    btcWexVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyWaultLp',
            core.controller.address,
            vaultAddress,
            '0xaE183DB956FAf760Aa29bFcfDa4BDDdB02fbdd0E', // btc wex lp
            MaticAddresses.WBTC_TOKEN,
            MaticAddresses.WEXpoly_TOKEN,
            24
        ) as Promise<IStrategy>,
        core.controller,
        core.psVault.address,
        signer
    ))[1];

    wexPearVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategyWaultLp',
            core.controller.address,
            vaultAddress,
            '0xcF35da701ffD92027f798fF7D28B4CB3b424111d', // pear wex lp
            MaticAddresses.PEAR_TOKEN,
            MaticAddresses.WEXpoly_TOKEN,
            26
        ) as Promise<IStrategy>,
        core.controller,
        core.psVault.address,
        signer
    ))[1];

    grtEthVault = (await DeployerUtils.deployAndInitVaultAndStrategy(
        't',
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategySushiSwapLp',
            core.controller.address,
            vaultAddress,
            '0x1cedA73C034218255F50eF8a2c282E6B4c301d60', // grt weth
            MaticAddresses.GRT_TOKEN,
            MaticAddresses.WETH_TOKEN,
            16
        ) as Promise<IStrategy>,
        core.controller,
        core.psVault.address,
        signer
    ))[1];

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

  it("should zap grtEthVault twice", async () => {
    // remove all usdc
    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, MaticAddresses.SUSHI_ROUTER,
        (await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address))
        .sub(utils.parseUnits('1000', 6)).toString());

    const v = grtEthVault.address;
    const underlying = await grtEthVault.underlying();
    await zapIntoVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN
    );

    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(underlying, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(underlying, multiSwap.address)).is.eq(0);

    console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

    const amountShare = await Erc20Utils.balanceOf(v, signer.address);

    await zapOutVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN,
        amountShare.toString()
    );

    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, multiSwap.address)).is.eq(0);

    //! ---------------------------------

    await zapIntoVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN,
        '500'
    );

    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(underlying, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(underlying, multiSwap.address)).is.eq(0);

    console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

    const amountShare2 = await Erc20Utils.balanceOf(v, signer.address);

    await zapOutVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN,
        amountShare2.toString()
    );

    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.WETH_TOKEN, multiSwap.address)).is.eq(0);

    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, zapContract.address)).is.eq(0);
    expect(await Erc20Utils.balanceOf(MaticAddresses.GRT_TOKEN, multiSwap.address)).is.eq(0);
  });

  it("should zap btcWexVault", async () => {
    // remove all usdc
    await Erc20Utils.transfer(MaticAddresses.USDC_TOKEN, signer, MaticAddresses.SUSHI_ROUTER,
        (await Erc20Utils.balanceOf(MaticAddresses.USDC_TOKEN, signer.address))
        .sub(utils.parseUnits('1000', 6)).toString());

    const v = btcWexVault.address;
    await zapIntoVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN
    );

    console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

    const amountShare = await Erc20Utils.balanceOf(v, signer.address);

    await zapOutVaultWithLp(
        signer,
        multiSwap,
        zapContract,
        cReader,
        v,
        MaticAddresses.USDC_TOKEN,
        amountShare.toString()
    );
  });

  it("should be able to invest to all vaults with 2 assets", async () => {

    const deployedZap = await DeployerUtils.connectInterface(
        signer, 'ZapContract',
        Addresses.TOOLS.get('matic')?.zapContract as string
    ) as ZapContract;

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

    for (let i = 41; i < vaults.length; i++) {
      const vault = vaults[i];
      console.log(i, await contractReader.vaultName(vault));
      const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
      if ((await contractReader.strategyAssets(await vCtr.strategy())).length !== 2
          || exclude.has(vault.toLowerCase())) {
        continue;
      }

      await zapIntoVaultWithLp(
          signer,
          deployedMultiSwap,
          deployedZap,
          contractReader,
          vault,
          MaticAddresses.USDC_TOKEN,
          '10'
      );


      console.log('!!!!!!!!!!!!!!!!! OUT !!!!!!!!!!!!!!!!!!!!!!!')

      const amountShare = await Erc20Utils.balanceOf(vault, signer.address);

      await zapOutVaultWithLp(
          signer,
          deployedMultiSwap,
          deployedZap,
          contractReader,
          vault,
          MaticAddresses.USDC_TOKEN,
          amountShare.toString()
      );

    }

  });


});

async function zapIntoVaultWithLp(
    signer: SignerWithAddress,
    multiSwap: MultiSwap,
    zapContract: ZapContract,
    cReader: ContractReader,
    vault: string,
    tokenIn: string,
    amountRaw = '1000'
) {
  const tokenInDec = await Erc20Utils.decimals(tokenIn);
  const amount = utils.parseUnits(amountRaw, tokenInDec);
  expect(+utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec))
  .is.greaterThanOrEqual(+utils.formatUnits(amount, tokenInDec));


  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  const tokensOut = [];
  const tokensOutLps = [];

  for (let asset of assets) {
    const lps = await multiSwap.findLpsForSwaps(tokenIn, asset);

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

  await Erc20Utils.approve(tokenIn, signer, zapContract.address, amount.toString())
  await zapContract.zapIntoLp(
      vault,
      tokenIn,
      tokensOut[0],
      tokensOutLps[0],
      tokensOut[1],
      tokensOutLps[1],
      amount,
      9
  );


  expect(await Erc20Utils.balanceOf(vault, signer.address)).is.not.eq(0);

  const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tokenIn, signer.address), tokenInDec);
  console.log('balance after ADD', balanceAfter);
}

async function zapOutVaultWithLp(
    signer: SignerWithAddress,
    multiSwap: MultiSwap,
    zapContract: ZapContract,
    cReader: ContractReader,
    vault: string,
    tokenOut: string,
    amountShare: string
) {
  const tokenOutDec = await Erc20Utils.decimals(tokenOut);
  const balanceBefore = +utils.formatUnits(await Erc20Utils.balanceOf(tokenOut, signer.address), tokenOutDec)

  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

  const strategy = await smartVault.strategy()

  const assets = await cReader.strategyAssets(strategy);

  const assetsLpRoute = [];

  for (let asset of assets) {
    const lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();

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

  await Erc20Utils.approve(vault, signer, zapContract.address, amountShare.toString())
  await zapContract.zapOutLp(
      vault,
      tokenOut,
      assets[0],
      assetsLpRoute[0],
      assets[1],
      assetsLpRoute[1],
      amountShare,
      9
  );

  const balanceAfter = +utils.formatUnits(await Erc20Utils.balanceOf(tokenOut, signer.address), tokenOutDec);
  console.log('balance after REMOVE', balanceAfter);
  expect(balanceAfter).is.greaterThan(balanceBefore);
}
