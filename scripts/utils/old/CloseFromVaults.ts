import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, ContractReader} from "../../../typechain";
import {RunHelper} from "../RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (let vault of vaults) {
    let vInfoWithUser;
    try {
      vInfoWithUser = await cReader.vaultWithUserInfos(signer.address, [vault]);
    } catch (e) {
      console.log('error fetch vault info', vault, e);
      continue;
    }
    const vInfo = vInfoWithUser[0].vault
    const uInfo = vInfoWithUser[0].user

    if (!uInfo.depositedUnderlying.isZero()) {
      console.log('close from', vInfo.name);
      const vaultContract = await DeployerUtils.connectVault(vault, signer);
      await RunHelper.runAndWait(() => vaultContract.exit());
    } else {
      console.log('zero deposit', vInfo.name);
    }



  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
