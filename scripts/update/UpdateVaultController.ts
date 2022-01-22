import { ethers } from 'hardhat';
import { DeployerUtils } from '../deploy/DeployerUtils';
import { VaultController } from '../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const net = await ethers.provider.getNetwork();

  const logic = (await DeployerUtils.deployContract(
    signer,
    'VaultController'
  )) as VaultController;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
