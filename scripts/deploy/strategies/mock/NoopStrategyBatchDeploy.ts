import { ethers } from 'hardhat';
import { DeployerUtils } from '../../DeployerUtils';
import {
  Controller,
  IStrategy,
  SmartVault,
  VaultController,
} from '../../../../typechain';
import { Misc } from '../../../utils/tools/Misc';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const datas = [];
  const core = await DeployerUtils.getCoreAddresses();
  const mocks = await DeployerUtils.getTokenAddresses();
  const controller = (await DeployerUtils.connectContract(
    signer,
    'Controller',
    core.controller
  )) as Controller;
  const vaultController = (await DeployerUtils.connectContract(
    signer,
    'VaultController',
    core.vaultController
  )) as VaultController;

  for (let i = 0; i < 10; i++) {
    const vaultName: string = 'NOOP_MockUSDC_' + i;
    const strategyName = 'NoopStrategy';
    const vaultRewardToken: string = core.psVault;
    const rewardDuration: number = 60 * 60 * 24 * 28; // 1 week

    const vaultLogic = await DeployerUtils.deployContract(signer, 'SmartVault');
    const vaultProxy = await DeployerUtils.deployContract(
      signer,
      'TetuProxyControlled',
      vaultLogic.address
    );
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    const strategy = (await DeployerUtils.deployContract(
      signer,
      strategyName,
      controller.address,
      mocks.get('usdc'),
      vault.address,
      [mocks.get('quick')],
      [mocks.get('usdc')],
      1
    )) as IStrategy;

    const strategyUnderlying = await strategy.underlying();

    await vault.initializeSmartVault(
      'V_' + vaultName,
      'b' + vaultName,
      controller.address,
      strategyUnderlying,
      rewardDuration,
      false,
      Misc.ZERO_ADDRESS,
      0
    );
    await vaultController.addRewardTokens([vault.address], vaultRewardToken);
    await vaultController.addRewardTokens(
      [vault.address],
      mocks.get('weth') as string
    );
    await vaultController.addRewardTokens(
      [vault.address],
      mocks.get('sushi') as string
    );

    await controller.addVaultsAndStrategies(
      [vault.address],
      [strategy.address]
    );

    datas.push([vaultLogic, vault, strategy]);
  }

  for (const data of datas) {
    const vaultLogic = data[0];
    const vaultProxy = data[1];
    const strategy = data[2];

    await DeployerUtils.wait(5);
    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vaultProxy.address, [
      vaultLogic.address,
    ]);
    await DeployerUtils.verifyProxy(vaultProxy.address);
    await DeployerUtils.verifyWithArgs(strategy.address, [
      controller.address,
      mocks.get('usdc'),
      vaultProxy.address,
      [mocks.get('quick')],
    ]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
