import { ethers } from 'hardhat';
import { DeployerUtils } from '../DeployerUtils';
import { MaticAddresses } from '../../addresses/MaticAddresses';
import { IStrategy } from '../../../typechain';

const UNDERLYING = MaticAddresses.miFARM_TOKEN;
const VAULT = '0xE7C61cBcd5592Bf1B9DB3612B220f418afe89B64';
const PLATFORM = 17;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const strategyArgs = [
    core.controller, // _controller
    UNDERLYING, // _underlying
    VAULT, // _vault
    [], // __rewardTokens
    [UNDERLYING], // __assets
    PLATFORM, // __platform
  ];

  const strategy = (await DeployerUtils.deployContract(
    signer,
    'NoopStrategy',
    ...strategyArgs,
  )) as IStrategy;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(strategy.address, strategyArgs);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
