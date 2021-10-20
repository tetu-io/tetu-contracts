import {DeployerUtils} from "../deploy/DeployerUtils";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

async function main() {
  const core = await DeployerUtils.getCoreAddresses();

  const vaultLogic = '0xCc6D9b0506f0929Ced13f1143Dab2d4fF59deaCC';
  const vaultProxy = '0xBd2E7f163D7605fa140D873Fea3e28a031370363';
  const strategy = '0x4c992DA437ab1AA6f101BD9C0885a04f6289C71D';
  const token = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
  const rTokenAddress = '0xCa0F37f73174a28a64552D426590d3eD601ecCa1';
  const borrowTarget = 4500;
  const collateralFactor = 4999;

  // await DeployerUtils.verify(vaultLogic);
  await DeployerUtils.verifyWithArgs(vaultProxy, [vaultLogic]);
  // await DeployerUtils.verifyProxy(vaultProxy);
  // await DeployerUtils.verifyWithContractName(strategy, 'contracts/strategies/matic/iron/StrategyIronFold.sol:StrategyIronFold', [
  //   core.controller,
  //   vaultProxy,
  //   token,
  //   rTokenAddress,
  //   borrowTarget,
  //   collateralFactor
  // ]);

}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
