import {ethers, web3} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Contract, ContractFactory, utils} from "ethers";
import {
  AaveAmPipe,
  Announcer,
  AutoRewarder,
  Bookkeeper,
  ContractReader,
  ContractUtils,
  Controller,
  ForwarderV2,
  FundKeeper,
  IStrategy,
  IStrategy__factory,
  ITetuProxy,
  LiquidityBalancer,
  MintHelper,
  MockFaucet,
  Multicall,
  MultiSwap,
  NoopStrategy,
  NotifyHelper,
  PawnShopReader,
  PayrollClerk,
  PriceCalculator,
  RewardCalculator,
  RewardToken,
  SmartVault,
  StrategySplitter,
  TetuProxyControlled,
  TetuProxyGov,
  TetuSwapFactory,
  VaultController,
  ZapContract,
} from "../../typechain";
import {expect} from "chai";
import {CoreContractsWrapper} from "../../test/CoreContractsWrapper";
import {Addresses} from "../../addresses";
import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";
import axios from "axios";
import {RunHelper} from "../utils/tools/RunHelper";
import {config as dotEnvConfig} from "dotenv";
import {ToolsContractsWrapper} from "../../test/ToolsContractsWrapper";
import {Misc} from "../utils/tools/Misc";
import logSettings from "../../log_settings";
import {Logger} from "tslog";
import {MaticAddresses} from "../addresses/MaticAddresses";
import {FtmAddresses} from "../addresses/FtmAddresses";
import {TimeUtils} from "../../test/TimeUtils";
import {readFileSync} from "fs";
import {Libraries} from "hardhat-deploy/dist/types";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");
const log: Logger = new Logger(logSettings);


dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    networkScanKey: {
      type: "string",
    },
  }).argv;

const libraries = new Map<string, string>([
  ['SmartVault', 'VaultLibrary']
]);

export class DeployerUtils {

  // ************ CONTRACT CONNECTION **************************

  public static async connectContract<T extends ContractFactory>(
    signer: SignerWithAddress,
    name: string,
    address: string
  ) {
    const _factory = (await ethers.getContractFactory(
      name,
      signer
    )) as T;
    const instance = _factory.connect(signer);
    return instance.attach(address);
  }

  public static async connectInterface<T extends Contract>(
    signer: SignerWithAddress,
    name: string,
    address: string
  ) {
    return ethers.getContractAt(name, address, signer);
  }

  public static async connectVault(address: string, signer: SignerWithAddress): Promise<SmartVault> {
    const proxy = await DeployerUtils.connectContract(signer, "TetuProxyControlled", address) as TetuProxyControlled;
    const logicAddress = await proxy.implementation();
    const logic = await DeployerUtils.connectContract(signer, "SmartVault", logicAddress) as SmartVault;
    return logic.attach(proxy.address);
  }

  public static async connectProxy(address: string, signer: SignerWithAddress, name: string): Promise<Contract> {
    const proxy = await DeployerUtils.connectInterface(signer, "ITetuProxy", address) as ITetuProxy;
    const logicAddress = await proxy.callStatic.implementation();
    const logic = await DeployerUtils.connectContract(signer, name, logicAddress);
    return logic.attach(proxy.address);
  }

  // ************ CONTRACT DEPLOY **************************

  public static async deployContract<T extends ContractFactory>(
    signer: SignerWithAddress,
    name: string,
    // tslint:disable-next-line:no-any
    ...args: any[]
  ) {
    const start = Date.now();
    log.info(`Deploying ${name}`);
    log.info("Account balance: " + utils.formatUnits(await signer.getBalance(), 18));

    const gasPrice = await web3.eth.getGasPrice();
    log.info("Gas price: " + gasPrice);
    const lib: string | undefined = libraries.get(name);
    let _factory;
    if (lib) {
      console.log('DEPLOY LIBRARY', lib, 'for', name);
      const libAddress = (await DeployerUtils.deployContract(signer, lib)).address;
      await DeployerUtils.wait(1);
      const librariesObj: Libraries = {};
      librariesObj[lib] = libAddress;
      _factory = (await ethers.getContractFactory(
        name,
        {
          signer,
          libraries: librariesObj
        }
      )) as T;
    } else {
      _factory = (await ethers.getContractFactory(
        name,
        signer
      )) as T;
    }
    const instance = await _factory.deploy(...args);
    console.log('Deploy tx:', instance.deployTransaction.hash);
    await instance.deployed();

    const receipt = await ethers.provider.getTransactionReceipt(instance.deployTransaction.hash);
    console.log('Receipt', receipt.contractAddress)

    Misc.printDuration(name + ' deployed ' + receipt.contractAddress, start);
    return _factory.attach(receipt.contractAddress);
  }

  public static async deployTetuProxyControlled<T extends ContractFactory>(
      signer: SignerWithAddress,
      logicContractName: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, logicContractName);
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    return [proxy, logic];
  }

  public static async deployController(signer: SignerWithAddress): Promise<Controller> {
    const logic = await DeployerUtils.deployContract(signer, "Controller");
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    const contract = logic.attach(proxy.address) as Controller;
    await contract.initialize();
    return contract;
  }

  public static async deploySwapFactory(signer: SignerWithAddress, controller: string)
    : Promise<[TetuSwapFactory, TetuProxyControlled, TetuSwapFactory]> {
    const logic = await DeployerUtils.deployContract(signer, "TetuSwapFactory") as TetuSwapFactory;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const contract = logic.attach(proxy.address) as TetuSwapFactory;
    await contract.initialize(controller);
    return [contract, proxy, logic];
  }

  public static async deployAnnouncer(signer: SignerWithAddress, controller: string, timeLock: number)
    : Promise<[Announcer, TetuProxyControlled, Announcer]> {
    const logic = await DeployerUtils.deployContract(signer, "Announcer") as Announcer;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const contract = logic.attach(proxy.address) as Announcer;
    await contract.initialize(controller, timeLock);
    return [contract, proxy, logic];
  }

  public static async deployVaultController(signer: SignerWithAddress, controller: string)
    : Promise<[VaultController, TetuProxyControlled, VaultController]> {
    const logic = await DeployerUtils.deployContract(signer, "VaultController") as VaultController;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const contract = logic.attach(proxy.address) as VaultController;
    await contract.initialize(controller);
    return [contract, proxy, logic];
  }

  public static async deployForwarderV2(
    signer: SignerWithAddress,
    controllerAddress: string
  ): Promise<[ForwarderV2, TetuProxyControlled, ForwarderV2]> {
    const logic = await DeployerUtils.deployContract(signer, "ForwarderV2") as ForwarderV2;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const contract = logic.attach(proxy.address) as ForwarderV2;
    await contract.initialize(controllerAddress);
    return [contract, proxy, logic];
  }

  public static async deployMintHelper(
    signer: SignerWithAddress,
    controllerAddress: string,
    funds: string[],
    fractions: number[]
  ): Promise<[MintHelper, TetuProxyControlled, MintHelper]> {
    const logic = await DeployerUtils.deployContract(signer, "MintHelper") as MintHelper;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const contract = logic.attach(proxy.address) as MintHelper;
    await contract.initialize(controllerAddress, funds, fractions);

    return [contract, proxy, logic];
  }

  public static async deployBookkeeper(signer: SignerWithAddress, controller: string): Promise<Bookkeeper> {
    const logic = await DeployerUtils.deployContract(signer, "Bookkeeper");
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    const bookkeeper = logic.attach(proxy.address) as Bookkeeper;
    await bookkeeper.initialize(controller);
    return bookkeeper;
  }

  public static async deployFundKeeper(signer: SignerWithAddress, controller: string): Promise<[FundKeeper, TetuProxyControlled, FundKeeper]> {
    const logic = await DeployerUtils.deployContract(signer, "FundKeeper") as FundKeeper;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address) as TetuProxyControlled;
    const fundKeeper = logic.attach(proxy.address) as FundKeeper;
    await fundKeeper.initialize(controller);
    return [fundKeeper, proxy, logic];
  }

  public static async deployLiquidityBalancer(signer: SignerWithAddress, controller: string): Promise<LiquidityBalancer> {
    return await DeployerUtils.deployContract(signer, "LiquidityBalancer", controller) as LiquidityBalancer;
  }

  public static async deployPriceCalculator(signer: SignerWithAddress, controller: string, wait = false): Promise<[PriceCalculator, TetuProxyGov, PriceCalculator]> {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return DeployerUtils.deployPriceCalculatorMatic(signer, controller, wait);
    } else if (net.chainId === 250) {
      return DeployerUtils.deployPriceCalculatorFantom(signer, controller, wait);
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async deployPriceCalculatorMatic(signer: SignerWithAddress, controller: string, wait = false): Promise<[PriceCalculator, TetuProxyGov, PriceCalculator]> {
    const logic = await DeployerUtils.deployContract(signer, "PriceCalculator") as PriceCalculator;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const calculator = logic.attach(proxy.address) as PriceCalculator;
    await calculator.initialize(controller);

    await RunHelper.runAndWait(() => calculator.addKeyTokens([
      MaticAddresses.USDC_TOKEN,
      MaticAddresses.WETH_TOKEN,
      MaticAddresses.DAI_TOKEN,
      MaticAddresses.USDT_TOKEN,
      MaticAddresses.WBTC_TOKEN,
      MaticAddresses.WMATIC_TOKEN,
      MaticAddresses.QUICK_TOKEN,
      MaticAddresses.QI_TOKEN,
    ]), true, wait);

    await RunHelper.runAndWait(() => calculator.setDefaultToken(MaticAddresses.USDC_TOKEN), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.QUICK_FACTORY, "Uniswap V2"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.SUSHI_FACTORY, "SushiSwap LP Token"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.WAULT_FACTORY, "WaultSwap LP"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.FIREBIRD_FACTORY, "FireBird Liquidity Provider"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.DFYN_FACTORY, "Dfyn LP Token"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.CAFE_FACTORY, "CafeSwap LPs"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.TETU_SWAP_FACTORY, "TetuSwap LP"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(MaticAddresses.DINO_FACTORY, "Dinoswap V2"), true, wait);

    // It is hard to calculate price of curve underlying token, easiest way is to replace pegged tokens with original
    await calculator.setReplacementTokens(MaticAddresses.BTCCRV_TOKEN, MaticAddresses.WBTC_TOKEN);
    await calculator.setReplacementTokens(MaticAddresses.AM3CRV_TOKEN, MaticAddresses.USDC_TOKEN);

    expect(await calculator.keyTokensSize()).is.not.eq(0);
    return [calculator, proxy, logic];
  }

  public static async deployPriceCalculatorFantom(signer: SignerWithAddress, controller: string, wait = false): Promise<[PriceCalculator, TetuProxyGov, PriceCalculator]> {
    const logic = await DeployerUtils.deployContract(signer, "PriceCalculator") as PriceCalculator;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const calculator = logic.attach(proxy.address) as PriceCalculator;
    await calculator.initialize(controller);

    await RunHelper.runAndWait(() => calculator.addKeyTokens([
      FtmAddresses.USDC_TOKEN,
      FtmAddresses.WETH_TOKEN,
      FtmAddresses.DAI_TOKEN,
      FtmAddresses.fUSDT_TOKEN,
      FtmAddresses.WBTC_TOKEN,
      FtmAddresses.WFTM_TOKEN
    ]), true, wait);

    await RunHelper.runAndWait(() => calculator.setDefaultToken(FtmAddresses.USDC_TOKEN), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(FtmAddresses.SPOOKY_SWAP_FACTORY, "Spooky LP"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(FtmAddresses.TETU_SWAP_FACTORY, "TetuSwap LP"), true, wait);
    await RunHelper.runAndWait(() => calculator.addSwapPlatform(FtmAddresses.SPIRIT_SWAP_FACTORY, "Spirit LPs"), true, wait);

    // It is hard to calculate price of curve underlying token, easiest way is to replace pegged tokens with original
    await calculator.setReplacementTokens(FtmAddresses.renCRV_TOKEN, FtmAddresses.WBTC_TOKEN);
    await calculator.setReplacementTokens(FtmAddresses.g3CRV_TOKEN, FtmAddresses.USDC_TOKEN);

    expect(await calculator.keyTokensSize()).is.not.eq(0);
    return [calculator, proxy, logic];
  }

  public static async deployPriceCalculatorTestNet(signer: SignerWithAddress, controller: string): Promise<[PriceCalculator, TetuProxyGov, PriceCalculator]> {
    const logic = await DeployerUtils.deployContract(signer, "PriceCalculator") as PriceCalculator;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const calculator = logic.attach(proxy.address) as PriceCalculator;
    await calculator.initialize(controller);
    const mocks = await DeployerUtils.getTokenAddresses();

    await calculator.addKeyTokens([
      mocks.get('quick') as string,
      mocks.get('sushi') as string,
      mocks.get('usdc') as string,
      mocks.get('weth') as string,
    ]);
    await calculator.setDefaultToken(mocks.get('usdc') as string);
    await calculator.addSwapPlatform(MaticAddresses.SUSHI_FACTORY, "SushiSwap LP Token");
    return [calculator, proxy, logic];
  }

  public static async deploySmartVault(signer: SignerWithAddress): Promise<SmartVault> {
    const logic = await DeployerUtils.deployContract(signer, "SmartVault");
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    return logic.attach(proxy.address) as SmartVault;
  }

  public static async deploySmartVaultLogic(signer: SignerWithAddress): Promise<SmartVault> {
    const logic = await DeployerUtils.deployContract(signer, "SmartVault");
    return logic as SmartVault;
  }

  public static async deployStrategyProxy(signer: SignerWithAddress, strategyName: string): Promise<IStrategy> {
    const logic = await DeployerUtils.deployContract(signer, strategyName);
    await DeployerUtils.wait(1);
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    return logic.attach(proxy.address) as IStrategy;
  }

  public static async deployStrategySplitter(signer: SignerWithAddress): Promise<StrategySplitter> {
    const logic = await DeployerUtils.deployContract(signer, "StrategySplitter");
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", logic.address);
    return logic.attach(proxy.address) as StrategySplitter;
  }

  public static async deployPayrollClerk(signer: SignerWithAddress, controller: string, calculator: string)
    : Promise<[PayrollClerk, TetuProxyGov, PayrollClerk]> {
    const logic = await DeployerUtils.deployContract(signer, "PayrollClerk") as PayrollClerk;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const contract = logic.attach(proxy.address) as PayrollClerk;
    await contract.initialize(controller, calculator);
    return [contract, proxy, logic];
  }

  public static async deployContractReader(signer: SignerWithAddress, controller: string, calculator: string)
    : Promise<[ContractReader, TetuProxyGov, ContractReader]> {
    const logic = await DeployerUtils.deployContract(signer, "ContractReader") as ContractReader;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const contract = logic.attach(proxy.address) as ContractReader;
    await contract.initialize(controller, calculator);
    return [contract, proxy, logic];
  }

  public static async deployRewardCalculator(signer: SignerWithAddress, controller: string, calculator: string)
    : Promise<[RewardCalculator, TetuProxyGov, RewardCalculator]> {
    const logic = await DeployerUtils.deployContract(signer, "RewardCalculator") as RewardCalculator;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const contract = logic.attach(proxy.address) as RewardCalculator;
    await contract.initialize(controller, calculator);
    return [contract, proxy, logic];
  }

  public static async deployAutoRewarder(
    signer: SignerWithAddress,
    controller: string,
    rewardCalculator: string,
    networkRatio: string,
    rewardsPerDay: string
  ): Promise<[AutoRewarder, TetuProxyGov, AutoRewarder]> {
    const logic = await DeployerUtils.deployContract(signer, "AutoRewarder") as AutoRewarder;
    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    const contract = logic.attach(proxy.address) as AutoRewarder;
    await contract.initialize(controller, rewardCalculator, networkRatio, rewardsPerDay);
    return [contract, proxy, logic];
  }

  public static async deployZapContract(
    signer: SignerWithAddress,
    controllerAddress: string,
    multiSwap: string
  ): Promise<ZapContract> {
    return await DeployerUtils.deployContract(signer, "ZapContract", controllerAddress, multiSwap) as ZapContract;
  }

  public static async deployMultiSwap(
    signer: SignerWithAddress,
    controllerAddress: string,
    calculatorAddress: string
  ): Promise<MultiSwap> {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return DeployerUtils.deployMultiSwapMatic(signer, controllerAddress, calculatorAddress);
    } else if (net.chainId === 250) {
      return DeployerUtils.deployMultiSwapFantom(signer, controllerAddress, calculatorAddress);
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async deployMultiSwapMatic(
    signer: SignerWithAddress,
    controllerAddress: string,
    calculatorAddress: string
  ): Promise<MultiSwap> {
    return await DeployerUtils.deployContract(signer, "MultiSwap",
      controllerAddress,
      calculatorAddress,
      [
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.SUSHI_FACTORY,
        MaticAddresses.WAULT_FACTORY,
        MaticAddresses.TETU_SWAP_FACTORY,
        MaticAddresses.CAFE_FACTORY,
        MaticAddresses.DFYN_FACTORY,
        MaticAddresses.DINO_FACTORY,
      ],
      [
        MaticAddresses.QUICK_ROUTER,
        MaticAddresses.SUSHI_ROUTER,
        MaticAddresses.WAULT_ROUTER,
        MaticAddresses.TETU_SWAP_ROUTER,
        MaticAddresses.CAFE_ROUTER,
        MaticAddresses.DFYN_ROUTER,
        MaticAddresses.DINO_ROUTER,
      ]
    ) as MultiSwap;
  }

  public static async deployMultiSwapFantom(
    signer: SignerWithAddress,
    controllerAddress: string,
    calculatorAddress: string
  ): Promise<MultiSwap> {
    return await DeployerUtils.deployContract(signer, "MultiSwap",
      controllerAddress,
      calculatorAddress,
      [
        FtmAddresses.SPOOKY_SWAP_FACTORY,
        FtmAddresses.TETU_SWAP_FACTORY,
        FtmAddresses.SPIRIT_SWAP_FACTORY,
      ],
      [
        FtmAddresses.SPOOKY_SWAP_ROUTER,
        FtmAddresses.TETU_SWAP_ROUTER,
        FtmAddresses.SPIRIT_SWAP_ROUTER,
      ]
    ) as MultiSwap;
  }

  public static async deployAllCoreContracts(
    signer: SignerWithAddress,
    psRewardDuration: number = 60 * 60 * 24 * 28,
    timeLock: number = 60 * 60 * 48,
    wait = false
  ): Promise<CoreContractsWrapper> {
    const start = Date.now();
    // ************** CONTROLLER **********
    const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
    const controllerProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", controllerLogic.address);
    const controller = controllerLogic.attach(controllerProxy.address) as Controller;
    await controller.initialize();

    // ************ ANNOUNCER **********
    const announcerData = await DeployerUtils.deployAnnouncer(signer, controller.address, timeLock);

    // ************ VAULT CONTROLLER **********
    const vaultControllerData = await DeployerUtils.deployVaultController(signer, controller.address);

    // ********* FEE FORWARDER *********
    const feeRewardForwarderData = await DeployerUtils.deployForwarderV2(signer, controller.address);

    // ********** BOOKKEEPER **********
    const bookkeeperLogic = await DeployerUtils.deployContract(signer, "Bookkeeper");
    const bookkeeperProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", bookkeeperLogic.address);
    const bookkeeper = bookkeeperLogic.attach(bookkeeperProxy.address) as Bookkeeper;
    await bookkeeper.initialize(controller.address);

    // ********** FUND KEEPER **************
    const fundKeeperData = await DeployerUtils.deployFundKeeper(signer, controller.address);

    // ******* REWARD TOKEN AND SUPPORT CONTRACTS ******
    const notifyHelper = await DeployerUtils.deployContract(signer, "NotifyHelper", controller.address) as NotifyHelper;
    const mintHelperData = await DeployerUtils.deployMintHelper(signer, controller.address, [signer.address], [3000]);
    const rewardToken = await DeployerUtils.deployContract(signer, "RewardToken", mintHelperData[0].address) as RewardToken;


    // ****** PS ********
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const psVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
    const psEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
      controller.address, rewardToken.address, psVault.address, [], [rewardToken.address], 1) as NoopStrategy;

    // !########### INIT ##############
    await RunHelper.runAndWait(() => psVault.initializeSmartVault(
      "TETU_PS",
      "xTETU",
      controller.address,
      rewardToken.address,
      psRewardDuration,
      false,
      MaticAddresses.ZERO_ADDRESS,
      0
    ), true, wait);

    // ******* SETUP CONTROLLER ********
    await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(feeRewardForwarderData[0].address), true, wait);
    await RunHelper.runAndWait(() => controller.setBookkeeper(bookkeeper.address), true, wait);
    await RunHelper.runAndWait(() => controller.setMintHelper(mintHelperData[0].address), true, wait);
    await RunHelper.runAndWait(() => controller.setRewardToken(rewardToken.address), true, wait);
    await RunHelper.runAndWait(() => controller.setPsVault(psVault.address), true, wait);
    await RunHelper.runAndWait(() => controller.setFund(fundKeeperData[0].address), true, wait);
    await RunHelper.runAndWait(() => controller.setAnnouncer(announcerData[0].address), true, wait);
    await RunHelper.runAndWait(() => controller.setVaultController(vaultControllerData[0].address), true, wait);
    await RunHelper.runAndWait(() => controller.setDistributor(notifyHelper.address), true, wait);

    try {
      const tokens = await DeployerUtils.getTokenAddresses()
      await RunHelper.runAndWait(() => controller.setFundToken(tokens.get('usdc') as string), true, wait);
    } catch (e) {
      console.error('USDC token not defined for network, need to setup Fund token later');
    }
    await RunHelper.runAndWait(() => controller.setRewardDistribution(
      [
        feeRewardForwarderData[0].address,
        notifyHelper.address
      ], true), true, wait);

    // need to add after adding bookkeeper
    await RunHelper.runAndWait(() =>
        controller.addVaultsAndStrategies([psVault.address], [psEmptyStrategy.address]),
      true, wait);

    Misc.printDuration('Core contracts deployed', start);
    return new CoreContractsWrapper(
      controller,
      controllerLogic.address,
      feeRewardForwarderData[0],
      feeRewardForwarderData[2].address,
      bookkeeper,
      bookkeeperLogic.address,
      notifyHelper,
      mintHelperData[0],
      mintHelperData[2].address,
      rewardToken,
      psVault,
      vaultLogic.address,
      psEmptyStrategy,
      fundKeeperData[0],
      fundKeeperData[2].address,
      announcerData[0],
      announcerData[2].address,
      vaultControllerData[0],
      vaultControllerData[2].address,
    );
  }

  public static async deployAllToolsContracts(signer: SignerWithAddress, core: CoreContractsWrapper): Promise<ToolsContractsWrapper> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const tools = Addresses.TOOLS.get(net.chainId + '');
    if (!tools) {
      throw Error('No config for ' + net.chainId);
    }
    const calculator = await DeployerUtils.deployPriceCalculator(signer, core.controller.address)
    const reader = await DeployerUtils.deployContractReader(signer, core.controller.address, calculator[0].address);
    // ! we will not deploy not important contracts
    return new ToolsContractsWrapper(
      calculator[0],
      reader[0],
      await DeployerUtils.connectInterface(signer, "ContractUtils", tools.utils) as ContractUtils,
      await DeployerUtils.connectInterface(signer, "LiquidityBalancer", tools.rebalancer) as LiquidityBalancer,
      await DeployerUtils.connectInterface(signer, "PayrollClerk", tools.payrollClerk) as PayrollClerk,
      await DeployerUtils.connectInterface(signer, "MockFaucet", tools.mockFaucet) as MockFaucet,
      await DeployerUtils.connectInterface(signer, "MultiSwap", tools.multiSwap) as MultiSwap,
      await DeployerUtils.connectInterface(signer, "ZapContract", tools.zapContract) as ZapContract,
      await DeployerUtils.connectInterface(signer, "Multicall", tools.multicall) as Multicall,
      await DeployerUtils.connectInterface(signer, "PawnShopReader", tools.pawnshopReader) as PawnShopReader,
    );

  }

  public static async deployAndInitVaultAndStrategy<T>(
    underlying: string,
    vaultName: string,
    strategyDeployer: (vaultAddress: string) => Promise<IStrategy>,
    controller: Controller,
    vaultController: VaultController,
    vaultRewardToken: string,
    signer: SignerWithAddress,
    rewardDuration: number = 60 * 60 * 24 * 28, // 4 weeks
    depositFee = 0,
    wait = false
  ): Promise<[SmartVault, SmartVault, IStrategy]> {
    const start = Date.now();
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault") as SmartVault;
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address) as TetuProxyControlled;
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;
    await RunHelper.runAndWait(() => vault.initializeSmartVault(
      "TETU_" + vaultName,
      "x" + vaultName,
      controller.address,
      underlying,
      rewardDuration,
      false,
      vaultRewardToken,
      depositFee
    ), true, wait);
    const strategy = await strategyDeployer(vault.address);
    Misc.printDuration(vaultName + ' vault initialized', start);

    await RunHelper.runAndWait(() => controller.addVaultsAndStrategies([vault.address], [strategy.address]), true, wait);
    await RunHelper.runAndWait(() => vaultController.setToInvest([vault.address], 1000), true, wait);
    Misc.printDuration(vaultName + ' deployAndInitVaultAndStrategy completed', start);
    return [vaultLogic, vault, strategy];
  }

  public static async deployVaultAndStrategy<T>(
    vaultName: string,
    strategyDeployer: (vaultAddress: string) => Promise<IStrategy>,
    controllerAddress: string,
    vaultRewardToken: string,
    signer: SignerWithAddress,
    rewardDuration: number = 60 * 60 * 24 * 28, // 4 weeks
    depositFee = 0,
    wait = false
  ): Promise<[SmartVault, SmartVault, IStrategy]> {
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault") as SmartVault;
    if (wait) {
      await DeployerUtils.wait(1);
    }
    log.info('vaultLogic ' + vaultLogic.address);
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    const strategy = await strategyDeployer(vault.address);

    const strategyUnderlying = await strategy.underlying();

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
      "TETU_" + vaultName,
      "x" + vaultName,
      controllerAddress,
      strategyUnderlying,
      rewardDuration,
      false,
      vaultRewardToken,
      depositFee
    ), true, wait);
    return [vaultLogic, vault, strategy];
  }

  public static async deployVaultAndStrategyProxy<T>(
    vaultName: string,
    underlying: string,
    strategyDeployer: (vaultAddress: string) => Promise<IStrategy>,
    controllerAddress: string,
    vaultRewardToken: string,
    signer: SignerWithAddress,
    rewardDuration: number = 60 * 60 * 24 * 28, // 4 weeks
    depositFee = 0,
    wait = false
  ): Promise<[SmartVault, SmartVault, IStrategy]> {
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault") as SmartVault;
    if (wait) {
      await DeployerUtils.wait(1);
    }
    log.info('vaultLogic ' + vaultLogic.address);
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
      "TETU_" + vaultName,
      "x" + vaultName,
      controllerAddress,
      underlying,
      rewardDuration,
      false,
      vaultRewardToken,
      depositFee
    ), true, wait);

    if (wait) {
      await DeployerUtils.wait(1);
    }

    const strategy = await strategyDeployer(vault.address);
    return [vaultLogic, vault, strategy];
  }

  public static async deployVaultWithSplitter(
    vaultName: string,
    signer: SignerWithAddress,
    controller: string,
    underlying: string,
    vaultRt: string
  ) {
    return DeployerUtils.deployVaultAndStrategy(
      vaultName,
      async (vaultAddress: string) => {
        console.log('Start deploy splitter')
        const splitter = await DeployerUtils.deployStrategySplitter(signer);
        console.log('Splitter init')
        await RunHelper.runAndWait(() => splitter.initialize(
          controller,
          underlying,
          vaultAddress,
        ));
        return IStrategy__factory.connect(splitter.address, signer);
      },
      controller,
      vaultRt,
      signer,
      60 * 60 * 24 * 28,
      0
    );
  }

  public static async deployDefaultNoopStrategyAndVault(
    signer: SignerWithAddress,
    controller: Controller,
    vaultController: VaultController,
    underlying: string,
    vaultRewardToken: string,
    rewardToken: string = ''
  ) {
    const netToken = await DeployerUtils.getNetworkTokenAddress();
    if (rewardToken === '') {
      rewardToken = netToken;
    }
    return DeployerUtils.deployAndInitVaultAndStrategy(
      underlying,
      't',
      vaultAddress => DeployerUtils.deployContract(
        signer,
        'NoopStrategy',
        controller.address, // _controller
        underlying, // _underlying
        vaultAddress,
        [rewardToken], // __rewardTokens
        [underlying], // __assets
        1 // __platform
      ) as Promise<IStrategy>,
      controller,
      vaultController,
      vaultRewardToken,
      signer
    );
  }

  public static async deployImpermaxLikeStrategies(
    signer: SignerWithAddress,
    controller: string,
    vaultAddress: string,
    underlying: string,
    strategyName: string,
    infoPath: string,
    minTvl = 2_000_000,
    buyBackRatio = 10_00,
  ) {

    const infos = readFileSync(infoPath, 'utf8').split(/\r?\n/);

    const strategies = [];

    for (const i of infos) {
      const info = i.split(',');
      const idx = info[0];
      const tokenName = info[2];
      const tokenAdr = info[3];
      const poolAdr = info[4];
      const tvl = info[5];

      if (+tvl < minTvl || idx === 'idx' || !tokenAdr || underlying.toLowerCase() !== tokenAdr.toLowerCase()) {
        // console.log('skip', idx, underlying, tokenAdr, +tvl);
        continue;
      }
      console.log('SubStrategy', idx, tokenName);

      const strategyArgs = [
        controller,
        vaultAddress,
        tokenAdr,
        poolAdr,
        buyBackRatio
      ];

      const deployedStart = await DeployerUtils.deployContract(
        signer,
        strategyName,
        ...strategyArgs
      ) as IStrategy;
      strategies.push(deployedStart.address);
    }
    console.log(' ================ IMPERMAX-LIKE DEPLOYED', strategies.length);
    return strategies;
  }

  // ************** VERIFY **********************

  public static async verify(address: string) {
    try {
      await hre.run("verify:verify", {
        address
      })
    } catch (e) {
      log.info('error verify ' + e);
    }
  }

  // tslint:disable-next-line:no-any
  public static async verifyWithArgs(address: string, args: any[]) {
    try {
      await hre.run("verify:verify", {
        address, constructorArguments: args
      })
    } catch (e) {
      log.info('error verify ' + e);
    }
  }

  // tslint:disable-next-line:no-any
  public static async verifyWithContractName(address: string, contractPath: string, args?: any[]) {
    try {
      await hre.run("verify:verify", {
        address, contract: contractPath, constructorArguments: args
      })
    } catch (e) {
      log.info('error verify ' + e);
    }
  }

  // tslint:disable-next-line:no-any
  public static async verifyWithArgsAndContractName(address: string, args: any[], contractPath: string) {
    try {
      await hre.run("verify:verify", {
        address, constructorArguments: args, contract: contractPath
      })
    } catch (e) {
      log.info('error verify ' + e);
    }
  }


  public static async verifyProxy(adr: string) {
    try {

      const resp =
        await axios.post(
          (await DeployerUtils.getNetworkScanUrl()) +
          `?module=contract&action=verifyproxycontract&apikey=${argv.networkScanKey}`,
          `address=${adr}`);
      // log.info("proxy verify resp", resp.data);
    } catch (e) {
      log.info('error proxy verify ' + adr + e);
    }
  }

  // ************** ADDRESSES **********************

  public static async getNetworkScanUrl(): Promise<string> {
    const net = (await ethers.provider.getNetwork());
    if (net.name === 'ropsten') {
      return 'https://api-ropsten.etherscan.io/api';
    } else if (net.name === 'kovan') {
      return 'https://api-kovan.etherscan.io/api';
    } else if (net.name === 'rinkeby') {
      return 'https://api-rinkeby.etherscan.io/api';
    } else if (net.name === 'ethereum') {
      return 'https://api.etherscan.io/api';
    } else if (net.name === 'matic') {
      return 'https://api.polygonscan.com/api'
    } else if (net.chainId === 80001) {
      return 'https://api-testnet.polygonscan.com/api'
    } else if (net.chainId === 250) {
      return 'https://api.ftmscan.com//api'
    } else {
      throw Error('network not found ' + net);
    }
  }

  public static async getCoreAddresses(): Promise<CoreAddresses> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const core = Addresses.CORE.get(net.chainId + '');
    if (!core) {
      throw Error('No config for ' + net.chainId);
    }
    return core;
  }

  public static async getCoreAddressesWrapper(signer: SignerWithAddress): Promise<CoreContractsWrapper> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const core = Addresses.CORE.get(net.chainId + '');
    if (!core) {
      throw Error('No config for ' + net.chainId);
    }

    const ps = await DeployerUtils.connectInterface(signer, "SmartVault", core.psVault) as SmartVault;
    const str = await ps.strategy();
    return new CoreContractsWrapper(
      await DeployerUtils.connectInterface(signer, "Controller", core.controller) as Controller,
      '',
      await DeployerUtils.connectInterface(signer, "ForwarderV2", core.feeRewardForwarder) as ForwarderV2,
      '',
      await DeployerUtils.connectInterface(signer, "Bookkeeper", core.bookkeeper) as Bookkeeper,
      '',
      await DeployerUtils.connectInterface(signer, "NotifyHelper", core.notifyHelper) as NotifyHelper,
      await DeployerUtils.connectInterface(signer, "MintHelper", core.mintHelper) as MintHelper,
      '',
      await DeployerUtils.connectInterface(signer, "RewardToken", core.rewardToken) as RewardToken,
      ps,
      '',
      await DeployerUtils.connectInterface(signer, "NoopStrategy", str) as NoopStrategy,
      await DeployerUtils.connectInterface(signer, "FundKeeper", core.fundKeeper) as FundKeeper,
      '',
      await DeployerUtils.connectInterface(signer, "Announcer", core.announcer) as Announcer,
      '',
      await DeployerUtils.connectInterface(signer, "VaultController", core.vaultController) as VaultController,
      '',
    );

  }

  public static async getToolsAddressesWrapper(signer: SignerWithAddress): Promise<ToolsContractsWrapper> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const tools = Addresses.TOOLS.get(net.chainId + '');
    if (!tools) {
      throw Error('No config for ' + net.chainId);
    }
    return new ToolsContractsWrapper(
      await DeployerUtils.connectInterface(signer, "PriceCalculator", tools.calculator) as PriceCalculator,
      await DeployerUtils.connectInterface(signer, "ContractReader", tools.reader) as ContractReader,
      await DeployerUtils.connectInterface(signer, "ContractUtils", tools.utils) as ContractUtils,
      await DeployerUtils.connectInterface(signer, "LiquidityBalancer", tools.rebalancer) as LiquidityBalancer,
      await DeployerUtils.connectInterface(signer, "PayrollClerk", tools.payrollClerk) as PayrollClerk,
      await DeployerUtils.connectInterface(signer, "MockFaucet", tools.mockFaucet) as MockFaucet,
      await DeployerUtils.connectInterface(signer, "MultiSwap", tools.multiSwap) as MultiSwap,
      await DeployerUtils.connectInterface(signer, "ZapContract", tools.zapContract) as ZapContract,
      await DeployerUtils.connectInterface(signer, "Multicall", tools.multicall) as Multicall,
      await DeployerUtils.connectInterface(signer, "PawnShopReader", tools.pawnshopReader) as PawnShopReader,
    );

  }

  public static async getToolsAddresses(): Promise<ToolsAddresses> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const tools = Addresses.TOOLS.get(net.chainId + '');
    if (!tools) {
      throw Error('No config for ' + net.chainId);
    }
    return tools;
  }

  public static async getTokenAddresses(): Promise<Map<string, string>> {
    const net = await ethers.provider.getNetwork();
    log.info('network ' + net.chainId);
    const mocks = Addresses.TOKENS.get(net.chainId + '');
    if (!mocks) {
      throw Error('No config for ' + net.chainId);
    }
    return mocks;
  }

  public static async impersonate(address: string | null = null) {
    if (address === null) {
      address = await DeployerUtils.getGovernance();
    }
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [address, "0x1431E0FAE6D7217CAA0000000"],
    });
    console.log('address impersonated', address);
    return ethers.getSigner(address);
  }

  public static async getDefaultNetworkFactory() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.QUICK_FACTORY;
    } else if (net.chainId === 250) {
      return FtmAddresses.SPOOKY_SWAP_FACTORY;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getUSDCAddress() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.USDC_TOKEN;
    } else if (net.chainId === 250) {
      return FtmAddresses.USDC_TOKEN;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getNetworkTokenAddress() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.WMATIC_TOKEN;
    } else if (net.chainId === 250) {
      return FtmAddresses.WFTM_TOKEN;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getTETUAddress() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.TETU_TOKEN;
    } else if (net.chainId === 250) {
      return FtmAddresses.TETU_TOKEN;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getBlueChips() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.BLUE_CHIPS;
    } else if (net.chainId === 250) {
      return FtmAddresses.BLUE_CHIPS;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getGovernance() {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.GOV_ADDRESS;
    } else if (net.chainId === 250) {
      return FtmAddresses.GOV_ADDRESS;
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async isBlueChip(address: string): Promise<boolean> {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.BLUE_CHIPS.has(address.toLowerCase())
    } else if (net.chainId === 250) {
      return FtmAddresses.BLUE_CHIPS.has(address.toLowerCase())
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getRouterByFactory(_factory: string) {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.getRouterByFactory(_factory);
    } else if (net.chainId === 250) {
      return FtmAddresses.getRouterByFactory(_factory);
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async getRouterName(_factory: string) {
    const net = await ethers.provider.getNetwork();
    if (net.chainId === 137) {
      return MaticAddresses.getRouterName(_factory);
    } else if (net.chainId === 250) {
      return FtmAddresses.getRouterName(_factory);
    } else {
      throw Error('No config for ' + net.chainId);
    }
  }

  public static async isNetwork(id: number) {
    return (await ethers.provider.getNetwork()).chainId === id;
  }

  public static async getStorageAt(address: string, index: string) {
    return ethers.provider.getStorageAt(address, index);
  }

  public static async setStorageAt(address: string, index: string, value: string) {
    await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
    await ethers.provider.send("evm_mine", []); // Just mines to the next block
  }

  // ****************** WAIT ******************

  public static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async wait(blocks: number) {
    const start = ethers.provider.blockNumber;
    while (true) {
      log.info('wait 10sec');
      await DeployerUtils.delay(10000);
      if (hre.network.name === 'hardhat') {
        await TimeUtils.advanceNBlocks(1);
      }
      if (ethers.provider.blockNumber >= start + blocks) {
        break;
      }
    }
  }


}
