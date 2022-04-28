import {ethers, network} from "hardhat";
import {
  Announcer,
  ContractReader,
  Controller,
  ERC20,
  IStrategy,
  SmartVault,
  SmartVault__factory
} from "../../../../typechain";
import {appendFileSync, mkdir, writeFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {utils} from "ethers";
import {TokenUtils} from "../../../../test/TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ToolsAddresses} from "../../../models/ToolsAddresses";


/**
 * Get vault address for TETU_CRV_REN
 *
 * Get all available vaults, get their names and found required vault by its name
 * @param signer
 * @param tools
 * @param vaultNameWithTetuPrefix TETU_CRV_REN
 */
async function get_vault_address(signer: SignerWithAddress, tools: ToolsAddresses, vaultNameWithTetuPrefix: string): Promise<string | undefined> {
  // read all vaults addresses
  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  // generate map: address : vaultNameWithTetuPrefix
  const vaultsMap = new Map<string, string>();
  for (const vAddress of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAddress), vAddress);
  }

  // find a vault by name
  return vaultsMap.get(vaultNameWithTetuPrefix);
}

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const destFn = `./tmp/update/strategies.txt`;

  console.log("network.name", network.name);
  let gov: SignerWithAddress;
  if (network.name === 'hardhat') {
    console.log('impersonate GOV');
    gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);
  } else {
    gov = signer;
  }
  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  // address of deployed strategy will be saved to destFn
  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });
  appendFileSync(destFn, '\n-----------\n', 'utf8');

  // get the smart vault and ensure that it's active
  const vaultNameWithoutPrefix = "CRV_REN";
  // const vaultAddress = "0x98C879fe2a22297DaBE1559247525d5269D87b61";
  const vaultAddress = await get_vault_address(signer, tools, `TETU_${vaultNameWithoutPrefix}`);
  if (vaultAddress === undefined) {
    console.log('Vault not found!', vaultNameWithoutPrefix);
    return;
  }
  console.log(`Vault address is ${vaultAddress}`);

  const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;
  if (!(await vCtr.active())) {
    console.log('vault not active', vaultAddress)
    return;
  }

  // deploy the strategy
  const strategy = await DeployerUtils.deployContract(
    signer,
    'CurveRenStrategy',
    core.controller,
    MaticAddresses.BTCCRV_TOKEN,
    vaultAddress
  ) as IStrategy;

  const txt = `${vaultNameWithoutPrefix}:     vault: ${vaultAddress}     strategy: ${strategy.address}\n`;
  appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

  // For hardhat: verify how the strategy works
  // For matic: verify the deployed strategy
  if (network.name === "hardhat") {
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
  } else {
    console.log('--------- Verify ----------')
    await DeployerUtils.wait(5);
    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy', [
      core.controller,
      MaticAddresses.BTCCRV_TOKEN,
      vaultAddress
    ]);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
