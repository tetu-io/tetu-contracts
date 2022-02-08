import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader} from "../../../typechain";
import {mkdir, writeFileSync} from 'fs';


async function main() {
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const contractReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;

  const vaults = await contractReader.vaults();
  console.log('vaults size', vaults.length);

  let data =
      'addr,' +
      'name,' +
      'strategy' +
      '\n';
  for (let i = 0; i < vaults.length; i++) {
    const info = await contractReader.vaultInfo(vaults[i]);
    if (info.platform !== 24) {
      console.log('skip ', i, ' ', info.name.toString())
      continue;
    }
    console.log(info.name.toString());
    data +=
        info.addr.toString() + ',' +
        info.name.toString() + ',' +
        info.strategy.toString() +
        '\n'
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/infos.json', data, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
