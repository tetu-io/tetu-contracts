import { ethers } from 'hardhat';
import { DeployerUtils } from '../deploy/DeployerUtils';
import { Bookkeeper } from '../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const logic = (await DeployerUtils.deployContract(
    signer,
    'Bookkeeper'
  )) as Bookkeeper;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
