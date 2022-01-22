import { ethers } from 'hardhat';
import { DeployerUtils } from '../../deploy/DeployerUtils';
import { Bookkeeper, ContractReader, IVersion } from '../../../typechain';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  await version(core.controller, signer, 'controller');
  await version(core.announcer, signer, 'announcer');
  await version(core.feeRewardForwarder, signer, 'feeRewardForwarder');
  await version(core.bookkeeper, signer, 'bookkeeper');
  await version(core.notifyHelper, signer, 'notifyHelper');
  await version(core.mintHelper, signer, 'mintHelper');
  await version(core.rewardToken, signer, 'rewardToken');
  await version(core.psVault, signer, 'psVault');
  await version(core.fundKeeper, signer, 'fundKeeper');
  await version(core.vaultController, signer, 'vaultController');
  await version(core.pawnshop, signer, 'pawnshop');
  await version(core.swapFactory, signer, 'swapFactory');
  await version(core.swapRouter, signer, 'swapRouter');
  await version(core.rewardCalculator, signer, 'rewardCalculator');
  await version(core.autoRewarder, signer, 'autoRewarder');

  await version(tools.calculator, signer, 'calculator');
  await version(tools.reader, signer, 'reader');
  await version(tools.utils, signer, 'utils');
  await version(tools.rebalancer, signer, 'rebalancer');
  await version(tools.payrollClerk, signer, 'payrollClerk');
  await version(tools.mockFaucet, signer, 'mockFaucet');
  await version(tools.multiSwap, signer, 'multiSwap');
  await version(tools.zapContract, signer, 'zapContract');
  await version(tools.multicall, signer, 'multicall');
  await version(tools.pawnshopReader, signer, 'pawnshopReader');

  const bookkeeper = (await DeployerUtils.connectContract(
    signer,
    'Bookkeeper',
    core.bookkeeper,
  )) as Bookkeeper;
  const cReader = (await DeployerUtils.connectContract(
    signer,
    'ContractReader',
    tools.reader,
  )) as ContractReader;

  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (const vault of vaults) {
    const name = await cReader.vaultName(vault);
    await version(vault, signer, name);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function version(
  contract: string,
  signer: SignerWithAddress,
  name: string,
): Promise<string> {
  if (
    contract === '0x0000000000000000000000000000000000000000' ||
    contract === ''
  ) {
    return 'empty';
  }
  const ctr = (await DeployerUtils.connectInterface(
    signer,
    'IVersion',
    contract,
  )) as IVersion;
  try {
    const v = await ctr.VERSION();
    console.log(name, v);
    return v;
  } catch (e) {
    console.error(name, 'NO VERSION');
    return 'NO VERSION';
  }
}
