import { MaticAddresses } from '../../../addresses/MaticAddresses';
import { DeployerUtils } from '../../DeployerUtils';
import { IStrategy } from '../../../../typechain';
import { ethers } from 'hardhat';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const VAULT = '0x5f77A03eB5E550a28cbC36758Dd8b00e6541e472';
  const STRATEGY_NAME = 'StrategyKlimaStaking';
  const UNDERLYING = MaticAddresses.KLIMA_TOKEN;

  const args = [core.controller, VAULT, UNDERLYING];
  const strategy = (await DeployerUtils.deployContract(
    signer,
    STRATEGY_NAME,
    ...args,
  )) as IStrategy;

  await DeployerUtils.verifyWithArgs(strategy.address, args);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
