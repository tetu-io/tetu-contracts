import {DeployerUtils} from "../../DeployerUtils";
import {StrategyTetuQiSelfFarm, TetuProxyControlled__factory} from "../../../../typechain";
import {ethers} from "hardhat";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const xtetuQi = '0x8f1505C8F3B45Cb839D09c607939095a4195738e';
  const tetuQi = '0x4Cd44ced63d9a6FEF595f6AD3F7CED13fCEAc768';

  const strategy = await DeployerUtils.deployStrategyProxy(
    signer,
    'StrategyTetuQiSelfFarm',
  ) as StrategyTetuQiSelfFarm;
  const strategyLogic = await TetuProxyControlled__factory.connect(strategy.address, signer).implementation()
  await strategy.initialize(core.controller, xtetuQi, tetuQi);

  await DeployerUtils.verify(strategyLogic);
  await DeployerUtils.verifyWithArgs(strategy.address, [strategyLogic]);
  await DeployerUtils.verifyProxy(strategy.address);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
