import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { TokenRetranslator } from '../../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const contract = (await DeployerUtils.deployContract(
    signer,
    'TokenRetranslator'
  )) as TokenRetranslator;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
