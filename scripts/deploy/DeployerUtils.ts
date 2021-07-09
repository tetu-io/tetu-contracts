import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Contract, ContractFactory, utils} from "ethers";
import {
  Bookkeeper,
  Controller,
  FeeRewardForwarder,
  GovernmentUpdatedProxy,
  IStrategy,
  LiquidityBalancer,
  MintHelper,
  NoopStrategy,
  NotifyHelper,
  PriceCalculatorMatic,
  RewardToken,
  SmartVault,
  VaultProxy
} from "../../typechain";
import {expect} from "chai";
import {CoreContractsWrapper} from "../../test/CoreContractsWrapper";
import {Addresses} from "../../addresses";
import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";
import axios from "axios";
import {Secrets} from "../../secrets";
import {RunHelper} from "../utils/RunHelper";

const hre = require("hardhat");

export class DeployerUtils {

  public static async connectContract<T extends ContractFactory>(
      signer: SignerWithAddress,
      name: string,
      address: string
  ) {
    const factory = (await ethers.getContractFactory(
        name,
        signer
    )) as T;
    const instance = await factory.connect(signer);
    return instance.attach(address);
  }

  public static async connectInterface<T extends Contract>(
      signer: SignerWithAddress,
      name: string,
      address: string
  ) {
    return await ethers.getContractAt(name, address, signer);
  }

  public static async connectVault(address: string, signer: SignerWithAddress): Promise<SmartVault> {
    const proxy = await DeployerUtils.connectContract(signer, "VaultProxy", address) as VaultProxy;
    const logicAddress = await proxy.implementation();
    const logic = await DeployerUtils.connectContract(signer, "SmartVault", logicAddress) as SmartVault;
    return logic.attach(proxy.address);
  }

  public static async connectProxy(address: string, signer: SignerWithAddress, name: string): Promise<any> {
    const proxy = await DeployerUtils.connectContract(signer, "GovernmentUpdatedProxy", address) as GovernmentUpdatedProxy;
    const logicAddress = await proxy.implementation();
    const logic = await DeployerUtils.connectContract(signer, name, logicAddress);
    return logic.attach(proxy.address);
  }

  public static async deployContract<T extends ContractFactory>(
      signer: SignerWithAddress,
      name: string,
      ...args: Array<any>
  ) {
    console.log(`Deploying ${name}`);
    console.log("Account balance:", utils.formatUnits(await signer.getBalance(), 18));
    const factory = (await ethers.getContractFactory(
        name,
        signer
    )) as T;
    const instance = await factory.deploy(...args);
    await instance.deployed();
    console.log(name + ' deployed', instance.address);
    return instance;
  }

  public static async deployController(signer: SignerWithAddress): Promise<Controller> {
    const logic = await DeployerUtils.deployContract(signer, "Controller");
    const proxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", logic.address);
    const contract = logic.attach(proxy.address) as Controller;
    await contract.initialize();
    return contract;
  }

  public static async deployFeeForwarder(signer: SignerWithAddress, controllerAddress: string): Promise<FeeRewardForwarder> {
    return await DeployerUtils.deployContract(
        signer, "FeeRewardForwarder", controllerAddress) as FeeRewardForwarder;
  }

  public static async deployMintHelper(
      signer: SignerWithAddress,
      controllerAddress: string,
      funds: string[],
      fractions: number[]
  ): Promise<MintHelper> {
    return await DeployerUtils.deployContract(signer, "MintHelper", controllerAddress, funds, fractions) as MintHelper;
  }

  public static async deployBookkeeper(signer: SignerWithAddress, controller: string): Promise<Bookkeeper> {
    const logic = await DeployerUtils.deployContract(signer, "Bookkeeper");
    const proxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", logic.address);
    const bookkeeper = logic.attach(proxy.address) as Bookkeeper;
    await bookkeeper.initialize(controller);
    return bookkeeper;
  }

  public static async deployLiquidityBalancer(signer: SignerWithAddress, controller: string): Promise<LiquidityBalancer> {
    return await DeployerUtils.deployContract(signer, "LiquidityBalancer", controller) as LiquidityBalancer;
  }

  public static async deployPriceCalculatorMatic(signer: SignerWithAddress, controller: string): Promise<PriceCalculatorMatic> {
    const logic = await DeployerUtils.deployContract(signer, "PriceCalculatorMatic");
    const proxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", logic.address);
    const calculator = logic.attach(proxy.address) as PriceCalculatorMatic;
    await calculator.initialize(controller);
    expect(await calculator.keyTokensSize()).is.not.eq(0);
    return calculator;
  }

  public static async deploySmartVault(signer: SignerWithAddress): Promise<SmartVault> {
    const logic = await DeployerUtils.deployContract(signer, "SmartVault");
    const proxy = await DeployerUtils.deployContract(signer, "VaultProxy", logic.address);
    return logic.attach(proxy.address) as SmartVault;
  }

  public static async deployAllCoreContracts(
      signer: SignerWithAddress,
      psRewardDuration: number = 60 * 60 * 24 * 7,
      wait = false
  ): Promise<CoreContractsWrapper> {
    const controllerLogic = await DeployerUtils.deployContract(signer, "Controller");
    const controllerProxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", controllerLogic.address);
    const controller = controllerLogic.attach(controllerProxy.address) as Controller;
    await controller.initialize();
    const feeRewardForwarder = await DeployerUtils.deployFeeForwarder(signer, controller.address);

    // ********** BOOKKEEPER **********
    const bookkeeperLogic = await DeployerUtils.deployContract(signer, "Bookkeeper");
    const bookkeeperProxy = await DeployerUtils.deployContract(signer, "GovernmentUpdatedProxy", bookkeeperLogic.address);
    const bookkeeper = bookkeeperLogic.attach(bookkeeperProxy.address) as Bookkeeper;
    await bookkeeper.initialize(controller.address);
    // expect(await bookkeeper.isGovernance(signer.address)).is.true;

    // ******* REWARD TOKEN AND SUPPORT CONTRACTS ******
    const notifyHelper = await DeployerUtils.deployContract(signer, "NotifyHelper", controller.address) as NotifyHelper;
    const mintHelper = await DeployerUtils.deployMintHelper(signer, controller.address, [signer.address], [3000]);
    const rewardToken = await DeployerUtils.deployContract(signer, "RewardToken", mintHelper.address) as RewardToken;


    // ****** PS ********
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "VaultProxy", vaultLogic.address);
    const psVault = vaultLogic.attach(vaultProxy.address) as SmartVault;
    const psEmptyStrategy = await DeployerUtils.deployContract(signer, "NoopStrategy",
        controller.address, rewardToken.address, psVault.address, [], [rewardToken.address]) as NoopStrategy;

    //!########### INIT ##############
    await RunHelper.runAndWait(() => psVault.initializeSmartVault(
        "TETU_PS",
        "xTETU",
        controller.address,
        rewardToken.address,
        psRewardDuration
    ), true, wait);

    // ******* SETUP CONTROLLER ********
    await RunHelper.runAndWait(() => controller.setFeeRewardForwarder(feeRewardForwarder.address), true, wait);
    await RunHelper.runAndWait(() => controller.setBookkeeper(bookkeeper.address), true, wait);
    await RunHelper.runAndWait(() => controller.setMintHelper(mintHelper.address), true, wait);
    await RunHelper.runAndWait(() => controller.setRewardToken(rewardToken.address), true, wait);
    await RunHelper.runAndWait(() => controller.setNotifyHelper(notifyHelper.address), true, wait);
    await RunHelper.runAndWait(() => controller.setPsVault(psVault.address), true, wait);

    await RunHelper.runAndWait(() => controller.setRewardDistribution(
        [
          feeRewardForwarder.address,
          notifyHelper.address
        ], true), true, wait);

    // need to add after adding bookkeeper
    await RunHelper.runAndWait(() =>
        controller.addVaultAndStrategy(psVault.address, psEmptyStrategy.address),
        true, wait);


    return new CoreContractsWrapper(
        controller,
        controllerLogic.address,
        feeRewardForwarder,
        bookkeeper,
        bookkeeperLogic.address,
        notifyHelper,
        mintHelper,
        rewardToken,
        psVault,
        vaultLogic.address,
        psEmptyStrategy
    );
  }

  public static async deployAndInitVaultAndStrategy<T>(
      vaultName: string,
      strategyName: string,
      controller: Controller,
      vaultRewardToken: string,
      signer: SignerWithAddress,
      rewardDuration: number = 60 * 60 * 24 * 7 // 1 week
  ): Promise<any[]> {
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "VaultProxy", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    const strategy = await DeployerUtils.deployContract(signer, strategyName,
        controller.address, vault.address) as IStrategy;

    const strategyUnderlying = await strategy.underlying();

    await vault.initializeSmartVault(
        "V_" + vaultName,
        "x" + vaultName,
        controller.address,
        strategyUnderlying,
        rewardDuration
    );
    await vault.addRewardToken(vaultRewardToken);

    await controller.addVaultAndStrategy(vault.address, strategy.address);

    // await DeployerUtils.wait(1);
    // expect(await vault.underlying()).is.eq(strategyUnderlying);

    return [vaultLogic, vault, strategy];
  }

  public static async newStratDeploy(
      signer: SignerWithAddress,
      vaultName: string,
      strategyName: string
  ) {
    const core = await DeployerUtils.getCoreAddresses();

    const controller = await DeployerUtils.connectContract(
        signer, 'Controller', core.controller) as Controller;

    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
        vaultName,
        strategyName,
        controller,
        core.psVault,
        signer
    );

    const vaultLogic = data[0];
    const vaultProxy = data[1];
    const strategy = data[2];

    await DeployerUtils.wait(5);
    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
    await DeployerUtils.verifyProxy(vaultProxy.address);
    await DeployerUtils.verifyWithArgs(strategy.address, [core.controller, core.psVault]);
  }

  public static async verify(address: string) {
    try {
      await hre.run("verify:verify", {
        address: address
      })
    } catch (e) {
      console.log('error verify', e);
    }
  }

  public static async getCoreAddresses(): Promise<CoreAddresses> {
    const net = await ethers.provider.getNetwork();
    console.log('network', net.name);
    const core = Addresses.CORE.get(net.name);
    if (!core) {
      throw Error('No config for ' + net.name);
    }
    return core;
  }

  public static async getToolsAddresses(): Promise<ToolsAddresses> {
    const net = await ethers.provider.getNetwork();
    console.log('network', net.name);
    const tools = Addresses.TOOLS.get(net.name);
    if (!tools) {
      throw Error('No config for ' + net.name);
    }
    return tools;
  }

  public static async getMockAddresses(): Promise<Map<string, string>> {
    const net = await ethers.provider.getNetwork();
    console.log('network', net.name);
    const mocks = Addresses.MOCKS.get(net.name);
    if (!mocks) {
      throw Error('No config for ' + net.name);
    }
    return mocks;
  }

  public static async verifyWithArgs(address: string, args: any[]) {
    try {
      await hre.run("verify:verify", {
        address: address, constructorArguments: args
      })
    } catch (e) {
      console.log('error verify', e);
    }
  }

  public static async wait(blocks: number) {
    const start = ethers.provider.blockNumber;
    while (true) {
      console.log('wait 10sec');
      await DeployerUtils.delay(10000);
      if (ethers.provider.blockNumber >= start + blocks) {
        break;
      }
    }
  }

  public static delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async verifyProxy(adr: string) {
    try {

      // const resp =
      await axios.post(
          (await DeployerUtils.getNetworkScanUrl()) +
          `?module=contract&action=verifyproxycontract&apikey=${Secrets.getNetworkScanKey()}`,
          `address=${adr}`);
      // console.log("proxy verify resp", resp);
    } catch (e) {
      console.log('error proxy verify', adr, e);
    }
  }

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
    } else {
      throw Error('network not found ' + net);
    }
  }

}
