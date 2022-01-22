import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const data = await DeployerUtils.deployRewardCalculator(
    signer,
    core.controller,
    tools.calculator,
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[2].address);
  await DeployerUtils.verifyWithArgs(data[1].address, [data[2].address]);
  await DeployerUtils.verifyProxy(data[1].address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
