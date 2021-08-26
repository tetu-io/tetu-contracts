import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader} from "../../../typechain";
import {VaultInfoModel} from "../../models/VaultInfoModel";
import {UserInfoModel} from "../../models/UserInfoModel";
import {mkdir, writeFileSync} from 'fs';
import {utils} from "ethers";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const contractReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;

  const vaults = await contractReader.vaults();
  console.log('vaults size', vaults.length);

  let data =
      'addr,' +
      'name,' +
      'created,' +
      'active,' +
      'tvl,' +
      'tvlUsdc,' +
      'decimals,' +
      'underlying,' +
      'rewardTokens,' +
      'rewardTokensBal,' +
      'rewardTokensBalUsdc,' +
      'duration,' +
      // 'rewardsApr,' +
      'ppfsApr,' +
      'users,' +
      'strategy,' +
      'strategyCreated,' +
      'platform,' +
      // 'assets,' +
      // 'strategyRewards,' +
      'strategyOnPause,' +
      'earned' +
      '\n';
  for (let i = 1; i < vaults.length; i++) {
    const info = await contractReader.vaultInfo(vaults[i]);
    console.log(info['name'].toString());
    data +=
        info['addr'].toString() + ',' +
        info['name'].toString() + ',' +
        info['created'].toString() + ',' +
        info['active'].toString() + ',' +
        utils.formatUnits(info['tvl']) + ',' +
        utils.formatUnits(info['tvlUsdc']) + ',' +
        info['decimals'].toString() + ',' +
        info['underlying'].toString() + ',' +
        info['rewardTokens'][0].toString() + ',' +
        info['rewardTokensBal'][0].toString() + ',' +
        info['rewardTokensBalUsdc'][0].toString() + ',' +
        info['duration'].toString() + ',' +
        // info['rewardsApr'].toString() + ',' +
        info['ppfsApr'].toString() + ',' +
        info['users'].toString() + ',' +
        info['strategy'].toString() + ',' +
        info['strategyCreated'].toString() + ',' +
        info['platform'].toString() + ',' +
        // info['assets'].toString() + ',' +
        // info['strategyRewards'].toString() + ',' +
        info['strategyOnPause'].toString() + ',' +
        utils.formatUnits(info['earned'])+ ',' +
        '\n'
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

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
