import { DeployerUtils } from '../../deploy/DeployerUtils';
import { ethers } from 'hardhat';
import { appendFileSync, writeFileSync } from 'fs';
import { utils } from 'ethers';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  writeFileSync(`./tmp/collect/vaults_without_users.txt`, '', 'utf8');

  const vaults = await core.bookkeeper.vaults();
  for (const vault of vaults) {
    const active = await tools.reader.vaultActive(vault);
    if (!active) {
      continue;
    }
    const tvl = +utils.formatUnits(await tools.reader.vaultTvlUsdc(vault));
    if (tvl > 3) {
      continue;
    }
    const vName = await tools.reader.vaultName(vault);
    const txt = `${vault} ${vName}\n`;
    console.log(txt);
    appendFileSync(`./tmp/collect/vaults_without_users.txt`, txt, 'utf8');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
