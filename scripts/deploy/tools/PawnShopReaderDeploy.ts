import { DeployerUtils } from '../DeployerUtils';
import { ethers } from 'hardhat';
import { PawnShopReader } from '../../../typechain';
import { RunHelper } from '../../utils/tools/RunHelper';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const logic = (await DeployerUtils.deployContract(
    signer,
    'PawnShopReader'
  )) as PawnShopReader;
  const proxy = await DeployerUtils.deployContract(
    signer,
    'TetuProxyGov',
    logic.address
  );
  const contract = logic.attach(proxy.address) as PawnShopReader;

  await RunHelper.runAndWait(() =>
    contract.initialize(core.controller, tools.calculator, core.pawnshop)
  );

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);
  await DeployerUtils.verifyWithArgs(proxy.address, [logic.address]);
  await DeployerUtils.verifyProxy(proxy.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
