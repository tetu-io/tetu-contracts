import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {IAaveProtocolDataProvider, IAToken, SmartVault,} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {FtmAddresses} from "../../addresses/FtmAddresses";
import {VaultUtils} from "../../../test/VaultUtils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const dataProvider = await DeployerUtils.connectInterface(
    signer, 'IAaveProtocolDataProvider', FtmAddresses.GEIST_PROTOCOL_DATA_PROVIDER) as IAaveProtocolDataProvider;

  const allLendingTokens = await dataProvider.getAllATokens();
  console.log('Lending tokens', allLendingTokens.length);


  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '16') {
      continue;
    }
    underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    if (vInfo.active) {
      const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
      currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.rewardToken));
    }
  }
  console.log('loaded vaults', underlyingStatuses.size);


  let infos: string = 'idx, token_name, token_address, aToken_name, aToken_address, dToken_Name, dToken_address, ltv, liquidationThreshold, usageAsCollateralEnabled, borrowingEnabled, vault, cur rewards\n';
  for (let i = 0; i < allLendingTokens.length; i++) {
    console.log('id', i);

    // if (i === 5 || i === 6) {
    //   console.log('skip volatile assets')
    //   continue;
    // }
    const aTokenAdr = allLendingTokens[i][1];
    const aTokenName = allLendingTokens[i][0];
    console.log('aTokenName', aTokenName, aTokenAdr)

    const aToken = await DeployerUtils.connectInterface(signer, 'IAToken', aTokenAdr) as IAToken;
    const tokenAdr = await aToken.UNDERLYING_ASSET_ADDRESS();
    const tokenName = await TokenUtils.tokenSymbol(tokenAdr);
    const dTokenAdr = (await dataProvider.getReserveTokensAddresses(tokenAdr))[2]
    const dTokenName = await TokenUtils.tokenSymbol(dTokenAdr);
    const confData = await dataProvider.getReserveConfigurationData(tokenAdr);
    const ltv = confData[1];
    const liquidationThreshold = confData[2];
    const usageAsCollateralEnabled = confData[5];
    const borrowingEnabled = confData[6];

    const data = i + ',' +
      tokenName + ',' +
      tokenAdr + ',' +
      aTokenName + ',' +
      aTokenAdr + ',' +
      dTokenName + ',' +
      dTokenAdr + ',' +
      ltv + ',' +
      liquidationThreshold + ',' +
      usageAsCollateralEnabled + ',' +
      borrowingEnabled + ',' +
      underlyingToVault.get(tokenAdr.toLowerCase()) + ',' +
      currentRewards.get(tokenAdr.toLowerCase())

    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/geist_markets.csv', infos, 'utf8');
  console.log('done');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
