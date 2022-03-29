import {ethers, network} from "hardhat";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {
  ContractReader,
  IStrategy,
  SmartVault,
  SmartVault__factory,
  StrategyMaiBal,
  StrategyMaiBal__factory,
  Announcer, Controller,
  ERC20

} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {utils} from "ethers";


async function main() {
  const vaultAddress = '0xe0816eCaF7F7DA3d4DE93430eD4E86AeBf1918aF';
  const strategyAddress = '0x3d9bd36AbeB51a6172EdC740d0F0Ab9E0A3a4e5e';

  const signer = (await ethers.getSigners())[0];
  const gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);

  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const cReader = await DeployerUtils.connectContract(signer, "ContractReader", tools.reader) as ContractReader;

  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  const cxETH = await DeployerUtils.connectInterface(signer, 'ERC20', MaticAddresses.cxETH_TOKEN) as ERC20;
  const amount = utils.parseUnits('1');
  console.log('getToken');
  await TokenUtils.getToken(MaticAddresses.cxETH_TOKEN, signer.address, amount);

  console.log('connectVault');
  const vault = SmartVault__factory.connect(vaultAddress, signer);
  console.log('connectVault Gov');
  const vaultGov = SmartVault__factory.connect(vaultAddress, gov);

  console.log('announceStrategyUpgrades');
  await announcer.announceStrategyUpgrades([vaultAddress], [strategyAddress]);
  const timeLockSec = (await announcer.timeLock()).toNumber();
  console.log('timeLockSec', timeLockSec);
  await network.provider.send("evm_increaseTime", [timeLockSec+1])
  await network.provider.send("evm_mine")
  console.log('setVaultStrategyBatch');
  await controller.setVaultStrategyBatch([vaultAddress],[strategyAddress]);

  const underlying = await vault.underlying();
  console.log('underlying', underlying);

  const balance = await cxETH.balanceOf(signer.address);
  console.log('balance', balance);
  console.log('approve');
  await cxETH.approve(vault.address, amount);
  console.log('depositAndInvest');
  await vault.depositAndInvest(amount);
  console.log('doHardWork');
  await vaultGov.doHardWork();
  console.log('+Complete');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
