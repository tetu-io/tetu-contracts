import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader, SmartVault} from "../../../typechain";
import {mkdir, writeFileSync} from 'fs';
import {utils} from "ethers";
import {VaultUtils} from "../../../test/VaultUtils";


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
      'earned,' +
      'estRewardAmount' +
      '\n';
  for (let i = 1; i < vaults.length; i++) {
    const info = await contractReader.vaultInfo(vaults[i]);
    console.log(info.name.toString());
    const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vaults[i]) as SmartVault;
    const estRew = await VaultUtils.vaultRewardsAmountCurrent(vaultCtr, core.psVault)
    console.log('estRew', estRew, 'realRew', utils.formatUnits(info.rewardTokensBal[0]), estRew - +utils.formatUnits(info.rewardTokensBal[0]));
    data +=
        info.addr.toString() + ',' +
        info.name.toString() + ',' +
        info.created.toString() + ',' +
        info.active.toString() + ',' +
        utils.formatUnits(info.tvl) + ',' +
        utils.formatUnits(info.tvlUsdc) + ',' +
        info.decimals.toString() + ',' +
        info.underlying.toString() + ',' +
        info.rewardTokens[0].toString() + ',' +
        utils.formatUnits(info.rewardTokensBal[0]) + ',' +
        utils.formatUnits(info.rewardTokensBalUsdc[0]) + ',' +
        info.duration.toString() + ',' +
        // info['rewardsApr'].toString() + ',' +
        info.ppfsApr.toString() + ',' +
        info.users.toString() + ',' +
        info.strategy.toString() + ',' +
        info.strategyCreated.toString() + ',' +
        info.platform.toString() + ',' +
        // info['assets'].toString() + ',' +
        // info['strategyRewards'].toString() + ',' +
        info.strategyOnPause.toString() + ',' +
        utils.formatUnits(info.earned) + ',' +
        estRew + ',' +
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
