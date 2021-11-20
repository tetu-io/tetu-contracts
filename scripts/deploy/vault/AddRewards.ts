import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {SmartVault} from "../../../typechain";
import {RunHelper} from "../../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);


  const vaults = await core.bookkeeper.vaults();

  let vaultForProcess: string[] = [];

  for (const vault of vaults) {
    if (vault.toLowerCase() === core.psVault.address.toLowerCase()) {
      continue;
    }
    const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const vaultName = await vaultCtr.name();
    console.log('vaultName', vault, vaultName);
    vaultForProcess.push(vault);
    if (vaultForProcess.length > 30) {
      // await RunHelper.runAndWait(() => core.vaultController.addRewardTokens(vaultForProcess, core.psVault.address));
      vaultForProcess = [];
    }
  }


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
