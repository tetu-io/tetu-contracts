import { ethers } from 'hardhat';
import { DeployerUtils } from '../deploy/DeployerUtils';
import { Controller } from '../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const logic = (await DeployerUtils.deployContract(
    signer,
    'Controller'
  )) as Controller;
  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
