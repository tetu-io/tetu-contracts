import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer, Bookkeeper, ContractReader, Controller} from "../../typechain";
import {RunHelper} from "../utils/tools/RunHelper";
import {expect} from "chai";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const vaultLogicAdr = '';
  const batch = 30;

  const controller = await DeployerUtils.connectInterface(signer, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(signer, 'Announcer', core.announcer) as Announcer;
  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;

  const vaultsLength = (await bookkeeper.vaultsLength()).toNumber();
  console.log('vaultsLength', vaultsLength);

  /*const vaults: string[] = [];
  for (let i = 0; i < vaultsLength; i++) {
    const vault = await bookkeeper._vaults(i);
    // if (
    //     !(await cReader.vaultActive(vault))
    //     &&
    //     !(await controller.vaults(vault))
    // ) {
    //   continue;
    // }
    vaults.push(vault);
    console.log('vault', vault, vaults.length);
  }*/
  const vaults = await bookkeeper.vaults();
  console.log('vaults.length', vaults.length);
  expect(vaultsLength === vaults.length);

  let vaultBatch: string[] = [];
  let logicBatch: string[] = [];
  for (const vault of vaults) {
    vaultBatch.push(vault)
    logicBatch.push(vaultLogicAdr);
    if (vaultBatch.length === batch) {
      await RunHelper.runAndWait(() => announcer.announceTetuProxyUpgradeBatch(vaultBatch, logicBatch));
      vaultBatch = [];
      logicBatch = [];
    }
  }
  await RunHelper.runAndWait(() => announcer.announceTetuProxyUpgradeBatch(vaultBatch, logicBatch));

  vaultBatch = [];
  logicBatch = [];
  for (const vault of vaults) {
    vaultBatch.push(vault)
    logicBatch.push(vaultLogicAdr);
    if (vaultBatch.length === batch) {
      await RunHelper.runAndWait(() => controller.upgradeTetuProxyBatch(vaultBatch, logicBatch));
      vaultBatch = [];
      logicBatch = [];
    }
  }
  await RunHelper.runAndWait(() => controller.upgradeTetuProxyBatch(vaultBatch, logicBatch));
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
