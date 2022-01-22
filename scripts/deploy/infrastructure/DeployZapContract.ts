import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const zap = await DeployerUtils.deployZapContract(
    signer,
    core.controller,
    tools.multiSwap,
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(zap.address, [
    core.controller,
    tools.multiSwap,
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
