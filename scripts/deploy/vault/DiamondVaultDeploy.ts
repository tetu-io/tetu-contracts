import { ethers } from 'hardhat';
import { DeployerUtils } from '../DeployerUtils';
import { NoopStrategy, SmartVault } from '../../../typechain';
import { RunHelper } from '../../utils/tools/RunHelper';

const REWARDS_DURATION = 60 * 60 * 24 * 28; // 28 days

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const vaultLogic = await DeployerUtils.deployContract(signer, 'SmartVault');
  const vaultProxy = await DeployerUtils.deployContract(
    signer,
    'TetuProxyControlled',
    vaultLogic.address,
  );
  const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

  const strategy = (await DeployerUtils.deployContract(
    signer,
    'NoopStrategy',
    core.controller,
    core.psVault,
    vault.address,
    [],
    [core.psVault],
    1,
  )) as NoopStrategy;

  const strategyUnderlying = await strategy.underlying();

  await RunHelper.runAndWait(() =>
    vault.initializeSmartVault(
      'TETU_DIAMOND_VAULT',
      'dxTETU',
      core.controller,
      strategyUnderlying,
      REWARDS_DURATION,
      true,
      vault.address,
      0,
    ),
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vaultProxy.address);
  await DeployerUtils.verifyWithContractName(
    strategy.address,
    'contracts/base/strategies/NoopStrategy.sol:NoopStrategy',
    [core.controller, core.psVault, vault.address, [], [core.psVault], 1],
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
