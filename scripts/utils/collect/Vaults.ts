import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  let txt = '';
  const vaults = await core.bookkeeper.vaults();
  for (const vault of vaults) {
    const vName = await tools.reader.vaultName(vault);
    txt += `${vName} - ${vault}\n`;
    console.log(txt);
  }
  writeFileSync(`./tmp/vaults.txt`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
