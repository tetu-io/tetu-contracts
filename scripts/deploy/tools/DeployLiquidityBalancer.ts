import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const contract = await DeployerUtils.deployContract(
    signer,
    'LiquidityBalancer',
    core.controller,
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, [core.controller]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
