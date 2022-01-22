import { ethers } from 'hardhat';
import { DeployerUtils } from '../../deploy/DeployerUtils';
import { Bookkeeper, NotifyHelper } from '../../../typechain';
import { TokenUtils } from '../../../test/TokenUtils';
import { BigNumber, utils } from 'ethers';
import { RunHelper } from '../tools/RunHelper';

async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const notifyHelper = (await DeployerUtils.connectContract(
    signer,
    'NotifyHelper',
    core.notifyHelper
  )) as NotifyHelper;
  const bookkeeper = (await DeployerUtils.connectContract(
    signer,
    'Bookkeeper',
    core.bookkeeper
  )) as Bookkeeper;

  const vaults = await bookkeeper.vaults();
  const availableAmount = +(+utils.formatUnits(
    await TokenUtils.balanceOf(core.rewardToken, core.notifyHelper),
    18
  )).toFixed();
  console.log('availableAmount', availableAmount);
  const basePerVault = availableAmount / vaults.length;
  console.log('basePerVault', basePerVault);

  const vaultsFiltered: string[] = [];
  const amounts: BigNumber[] = [];
  let sum = BigNumber.from(0);
  for (const item of vaults) {
    if (item.toLowerCase() === core.psVault.toLowerCase()) {
      continue;
    }
    const vaultContract = await DeployerUtils.connectVault(item, signer);
    if (!(await vaultContract.active())) {
      continue;
    }
    vaultsFiltered.push(item);
    const amount = utils.parseUnits(basePerVault.toFixed(), 18);
    console.log('amount', amount.toString());
    amounts.push(amount);
    sum = sum.add(amount);
    // const earned = await bookkeeper.targetTokenEarned(vaults[i]);
  }

  await RunHelper.runAndWait(() =>
    notifyHelper.notifyVaults(amounts, vaultsFiltered, sum, core.rewardToken)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
