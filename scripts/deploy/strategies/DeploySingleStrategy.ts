import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {Announcer, IStrategy} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const poolAddress = '0xbf89972C33a15811BcF023bc415bFaCfcC97E2E2';

  const vault = await DeployerUtils.connectVault('0x88aA5bcb8E1CF554106358c74e767225A574a4BA', signer);

  const strategy = await DeployerUtils.deployContract(signer, 'MockStrategyQuickSushiRopsten',
      core.controller, vault.address, poolAddress) as IStrategy;

  const announcer = await DeployerUtils.connectContract(signer, "Announcer", core.announcer) as Announcer;
  await announcer.announceStrategyUpgrades([vault.address], [strategy.address]);

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(strategy.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
