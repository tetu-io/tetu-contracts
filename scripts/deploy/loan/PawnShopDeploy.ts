import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { TetuPawnShop } from '../../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const contract = (await DeployerUtils.deployContract(
    signer,
    'TetuPawnShop',
    core.controller,
    core.rewardToken,
  )) as TetuPawnShop;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, [
    core.controller,
    core.rewardToken,
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
