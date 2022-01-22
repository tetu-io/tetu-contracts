import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { Controller } from '../../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const controllerLogic = await DeployerUtils.deployContract(
    signer,
    'Controller'
  );
  const controllerProxy = await DeployerUtils.deployContract(
    signer,
    'TetuProxyControlled',
    controllerLogic.address
  );
  const controller = controllerLogic.attach(
    controllerProxy.address
  ) as Controller;
  await controller.initialize();

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(controllerLogic.address);
  await DeployerUtils.verifyWithArgs(controllerProxy.address, [
    controllerLogic.address,
  ]);
  await DeployerUtils.verifyProxy(controllerProxy.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
