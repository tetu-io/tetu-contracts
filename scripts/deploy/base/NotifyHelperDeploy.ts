import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { NotifyHelper } from '../../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const notifyHelper = (await DeployerUtils.deployContract(
    signer,
    'NotifyHelper',
    core.controller,
  )) as NotifyHelper;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(notifyHelper.address, [core.controller]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
