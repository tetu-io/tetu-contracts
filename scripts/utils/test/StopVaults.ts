import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {RunHelper} from "../tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);

  const bookkeeper = core.bookkeeper;
  const announcer = core.announcer;

  const batch = 1;

  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  const vaultsForStop = [];
  for (const vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);
    const name = await vaultContract.name();
    console.log('vault', name, vault);
    if (
        !(await vaultContract.active())
        || vault === core.psVault.address
    ) {
      console.log('inactive or ps', name);
      continue;
    }

    if (name.indexOf('4') !== -1) {
      console.log('skip vault ', name);
      continue;
    }
    vaultsForStop.push(vault);
  }

  let i = 0;
  let vaultBatch: string[] = [];
  for (const vault of vaultsForStop) {
    i++;
    vaultBatch.push(vault)
    if (vaultBatch.length === batch || i === vaultsForStop.length) {
      try {
        await RunHelper.runAndWait(() => announcer.announceVaultStopBatch(vaultBatch));
      } catch (e) {
        console.log('ann', e);
      }
      vaultBatch = [];
    }
  }

  i = 0;
  vaultBatch = [];
  for (const vault of vaultsForStop) {
    i++;
    vaultBatch.push(vault)
    if (vaultBatch.length === batch || i === vaultsForStop.length) {
      console.log('vaultBatch', i, vaultBatch);
      try {
        await RunHelper.runAndWait(() => core.vaultController.stopVaultsBatch(vaultBatch));
      } catch (e) {
        console.log('stop', e);
      }
      vaultBatch = [];
    }
  }

}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
