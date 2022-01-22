import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { MultiSwap } from '../../../typechain';
import { FtmAddresses } from '../../addresses/FtmAddresses';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const multiSwap = (await DeployerUtils.deployMultiSwapFantom(
    signer,
    core.controller,
    tools.calculator
  )) as MultiSwap;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(multiSwap.address, [
    core.controller,
    tools.calculator,
    [
      FtmAddresses.SPOOKY_SWAP_FACTORY,
      FtmAddresses.TETU_SWAP_FACTORY,
      FtmAddresses.SPIRIT_SWAP_FACTORY,
    ],
    [
      FtmAddresses.SPOOKY_SWAP_ROUTER,
      FtmAddresses.TETU_SWAP_ROUTER,
      FtmAddresses.SPIRIT_SWAP_ROUTER,
    ],
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
