import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader, TetuProxyGov} from "../../../typechain";
import {VaultInfoModel} from "../../models/VaultInfoModel";
import {UserInfoModel} from "../../models/UserInfoModel";
import {mkdir, writeFileSync} from 'fs';
import {InfoModel} from "../../models/InfoModel";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const proxy = await DeployerUtils.connectContract(signer, "TetuProxyGov", tools.reader) as TetuProxyGov;
  const logicAddress = await proxy.implementation();
  const logic = await DeployerUtils.connectContract(signer, "ContractReader", logicAddress) as ContractReader;
  const contractReader = logic.attach(proxy.address);

  const vaults = await contractReader.vaults();
  console.log('vaults size', vaults.length);

  const infosParsed: InfoModel[] = [];
  for (let i = 0; i < vaults.length; i++) {
    const infos = await contractReader.vaultWithUserInfoPages(signer.address, i, 1);
    const info = infos[0];
    console.log('info', info.vault.name);
    infosParsed.push(new InfoModel(
        vaultInfo(info.vault),
        userInfo(info.user),
    ));
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const data = JSON.stringify(infosParsed);
  // console.log('data', data);
  await writeFileSync('./tmp/infos.json', data, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

function vaultInfo(info: any) {
  return new VaultInfoModel(
      info['addr'].toString(),
      info['name'].toString(),
      info['created'].toString(),
      info['active'].toString(),
      info['tvl'].toString(),
      info['tvlUsdc'].toString(),
      info['decimals'].toString(),
      info['underlying'].toString(),
      info['rewardTokens'].toString(),
      info['rewardTokensBal'].toString(),
      info['rewardTokensBalUsdc'].toString(),
      info['duration'].toString(),
      info['rewardsApr'].toString(),
      info['ppfsApr'].toString(),
      info['strategy'].toString(),
      info['strategyCreated'].toString(),
      info['platform'].toString(),
      info['assets'].toString(),
      info['strategyRewards'].toString(),
      info['strategyOnPause'].toString(),
      info['earned'].toString(),
  );
}

function userInfo(info: any) {
  return new UserInfoModel(
      info['wallet'].toString(),
      info['vault'].toString(),
      info['balance'].toString(),
      info['balanceUsdc'].toString(),
      info['rewardTokens'].toString(),
      info['rewards'].toString(),
  );
}
