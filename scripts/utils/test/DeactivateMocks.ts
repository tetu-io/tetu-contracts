import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper} from "../../../typechain";
import {RunHelper} from "../RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (let vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);
    if (!(await vaultContract.active()) || vault === core.psVault) {
      console.log('inactive ', await vaultContract.name());
      continue;
    }

    const vaultBalance = await vaultContract.underlyingBalanceWithInvestmentForHolder(signer.address);
    if (!vaultBalance.isZero()) {
      await RunHelper.runAndWait(() => vaultContract.exit());
    }

    await RunHelper.runAndWait(() => vaultContract.changeActivityStatus(false));

  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
