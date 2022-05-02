import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ToolsAddresses} from "../../../../models/ToolsAddresses";
import {DeployerUtils} from "../../../DeployerUtils";
import {
  Announcer,
  ContractReader,
  Controller,
  ERC20,
  IStrategy,
  SmartVault,
  SmartVault__factory
} from "../../../../../typechain";
import {CoreAddresses} from "../../../../models/CoreAddresses";
import {ethers, network} from "hardhat";
import {MaticAddresses} from "../../../../addresses/MaticAddresses";
import {utils} from "ethers";
import {TokenUtils} from "../../../../../test/TokenUtils";
import path from "path";
import {appendFileSync, mkdir} from "fs";
import {FtmAddresses} from "../../../../addresses/FtmAddresses";

//region Utils: find vault address, save strategy address to file
/**
 * Find all vaults and their addresses
 * @param signer
 * @param tools
 * @return  map: (vault name, vault address)
 */
export async function findAllVaults(signer: SignerWithAddress, tools: ToolsAddresses): Promise<Map<string, string>> {
  // read all vaults addresses
  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  // generate map: address : vaultNameWithTetuPrefix
  const vaultsMap = new Map<string, string>();
  for(const vAddress of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAddress), vAddress);
  }

  return vaultsMap;
}

/**
 * Get vault address for the give vault name
 *
 * Get all available vaults, get their names and found required vault by its name
 * @param signer
 * @param tools
 * @param vaultNameWithTetuPrefix i.e. TETU_CRV_REN
 */
export async function findVaultAddress(signer: SignerWithAddress, tools: ToolsAddresses, vaultNameWithTetuPrefix: string): Promise<string | undefined> {
  // get map: address : vaultNameWithTetuPrefix
  const vaultsMap = await findAllVaults(signer, tools);

  // find a vault by name
  return vaultsMap.get(vaultNameWithTetuPrefix);
}

/**
 * Prepare file to save address of vaults and strategies to the specified file.
 * Create target dir if necessary
 *
 * @param destPath i.e. `./tmp/update/strategies.txt`
 */
export function prepateFileToSaveUpdatedStrategies(destPath: string) {
  const dirName = path.dirname(destPath);
  mkdir(dirName, {recursive: true}, (err) => {
    if (err) throw err;
  });

  appendFileSync(destPath, '\n-----------\n', 'utf8');
}

/**
 * Save address of vaults and strategies to the specified file.
 * Create target dir if necessary
 *
 * @param destPath i.e. `./tmp/update/strategies.txt`
 * @param data Array of deployed strategies
 */
export function saveUpdatedStrategiesToFile(
  destPath: string,
  data: {vaultNameWithoutPrefix: string, vaultAddress: string, strategy: IStrategy}[]
) {
  prepateFileToSaveUpdatedStrategies(destPath);
  for (const j of data) {
    const txt = `${j.vaultNameWithoutPrefix}:     vault: ${j.vaultAddress}     strategy: ${j.strategy.address}\n`;
    appendFileSync(destPath, txt, 'utf8');
  }
}

//endregion Utils: find vault address, save strategy address to file

//region Test strategy on hardhat
/**
 * Test specified strategy on hardhat:
 *  - announce strategy upgrade, wait timelock period
 *  - assign the strategy to vault
 *  - deposit 1 underline token
 *  - do hard work
 *  - get balance with investment and calc balance change
 *
 *  Display all process details to console.
 *  TODO: do we need to check result balance here?
 *
 * @param signer
 * @param core
 * @param strategy
 * @param vaultAddress
 * @return
 *  true - passed
 *  false - skipped
 */
export async function testStrategyAfterUpgradeOnHardhat(
  signer: SignerWithAddress,
  core: CoreAddresses,
  strategy: IStrategy,
  vaultAddress: string
): Promise<boolean> {
  if (network.name !== 'hardhat') {
    console.log('Network is not hardhat, testStrategyOnHardhat is skipped')
    return false;
  }
  const net = await ethers.provider.getNetwork();

  const gov: SignerWithAddress = await DeployerUtils.impersonate(
    net.chainId === 137
      ? MaticAddresses.GOV_ADDRESS
      : FtmAddresses.GOV_ADDRESS
  );
  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  console.log('--------- Test Upgrade ----------')
  const strategyAddress = strategy.address;
  console.log('strategyAddress', strategyAddress);
  const vault = SmartVault__factory.connect(vaultAddress, signer);
  const vaultGov = SmartVault__factory.connect(vaultAddress, gov);
  const vaultName = await vault.name()
  console.log('vaultName', vaultName);
  const underlyingAddress = await vault.underlying();
  console.log('underlying', underlyingAddress);
  const underlying = await DeployerUtils.connectInterface(signer, 'ERC20', underlyingAddress) as ERC20;
  const amount = utils.parseUnits('1');
  console.log('getToken');
  await TokenUtils.getToken(underlyingAddress, signer.address, amount);

  console.log('announceStrategyUpgrades');
  await announcer.announceStrategyUpgrades([vaultAddress], [strategyAddress]);
  const timeLockSec = (await announcer.timeLock()).toNumber();
  console.log('timeLockSec', timeLockSec);
  await network.provider.send("evm_increaseTime", [timeLockSec + 1])
  await network.provider.send("evm_mine")
  console.log('setVaultStrategyBatch');
  const balanceBefore = await vault.underlyingBalanceWithInvestment();
  await controller.setVaultStrategyBatch([vaultAddress], [strategyAddress]);

  const balance = await underlying.balanceOf(signer.address);
  console.log('balance', balance);
  console.log('approve');
  await underlying.approve(vault.address, amount);
  console.log('depositAndInvest');
  await vault.depositAndInvest(amount);
  console.log('doHardWork');
  await vaultGov.doHardWork();
  const balanceAfter = await vault.underlyingBalanceWithInvestment();
  console.log('balanceAfter', balanceAfter);
  const balanceChange = (balanceAfter.mul(100_000).div(balanceBefore).toNumber()/1000 - 100).toFixed(3);
  console.log('balanceChange', balanceChange);
  console.log('+Complete');

  return true;
}
//endregion Test strategy on hardhat

//region Deploy and verify single strategy
/**
 * Deploy give strategy and save an address of new strategy to destPath.
 * Return undefined if the vault is not active.
 *
 * @param signer
 * @param core
 * @param vaultNameWithoutPrefix i.e. "CRV_REN"
 * @param vaultAddress
 * @param strategyName i.e. "CurveRenStrategy"
 * @param strategyConstructorParams list of parameters that will be passed to the strategy constructor
 */
export async function deploySingleStrategy(
  signer: SignerWithAddress,
  core: CoreAddresses,
  vaultNameWithoutPrefix: string,
  vaultAddress: string,
  strategyName: string,
  // tslint:disable-next-line:no-any
  strategyConstructorParams: any[]
) : Promise<IStrategy | undefined> {
  // ensure that the vault is active
  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
  if (!(await vCtr.active())) {
    console.log('vault not active', vaultAddress)
    return;
  }

  // deploy the strategy
  return await DeployerUtils.deployContract(signer, strategyName, ...strategyConstructorParams) as IStrategy;
}

/**
 * Verify the deployed strategy on matic
 *
 * @param strategy
 * @param strategyContractPath i.e. "contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy"
 * @param strategyConstructorParams list of parameters that will be passed to the strategy constructor
 */
export async function verifySingleStrategy(
  strategy: IStrategy,
  strategyContractPath: string,
  // tslint:disable-next-line:no-any
  strategyConstructorParams: any[]
) {
  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithContractName(strategy.address, strategyContractPath, strategyConstructorParams);
}

/**
 * Deploy and verify given strategy.
 * On success return new address of the deployed strategy.
 * Return undefined on fail.
 *
 * @param signer
 * @param core
 * @param vaultNameWithoutPrefix i.e. "CRV_REN"
 * @param vaultAddress
 * @param destPath i.e. `./tmp/update/strategies.txt`
 * @param strategyName i.e. "CurveRenStrategy"
 * @param strategyContractPath i.e. "contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy"
 * @param strategyConstructorParams  list of parameters that will be passed to the strategy constructor
 */
export async function deployAndVerifySingleStrategy(
  signer: SignerWithAddress,
  core: CoreAddresses,
  vaultNameWithoutPrefix: string,
  vaultAddress: string,
  destPath: string,
  strategyName: string,
  strategyContractPath: string,
  // tslint:disable-next-line:no-any
  strategyConstructorParams: any[]
) : Promise<string | undefined> {
  const strategy: IStrategy | undefined = await deploySingleStrategy(signer, core,
    vaultNameWithoutPrefix,
    vaultAddress,
    strategyName,
    strategyConstructorParams
  );

  if (strategy) {
    saveUpdatedStrategiesToFile(
      destPath
      , [{"vaultNameWithoutPrefix": vaultNameWithoutPrefix, "vaultAddress": vaultAddress, "strategy": strategy}]
    );

    if (network.name === "hardhat") {
      await testStrategyAfterUpgradeOnHardhat(signer, core, strategy, vaultAddress);
    } else {
      console.log('--------- Verify ----------')
      await verifySingleStrategy(strategy, strategyContractPath, strategyConstructorParams);
      console.log('--------- Verified ----------')
    }
    return strategy.address;
  } else {
    return undefined;
  }
}
//endregion Deploy and verify single strategy