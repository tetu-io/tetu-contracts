import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {CompleteRToken, IScreamController, PriceOracle, SmartVault,} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {utils} from "ethers";
import {FtmAddresses} from "../../addresses/FtmAddresses";
import {VaultUtils} from "../../../test/VaultUtils";

const exclude = new Set<number>([
  2,
  4,
  5,
  6,
  9,
  11,
  12,
  13,
  15,
  16,
  22,
]);


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const controller = await DeployerUtils.connectInterface(signer, 'IScreamController', FtmAddresses.SCREAM_CONTROLLER) as IScreamController;
  const priceOracle = await DeployerUtils.connectInterface(signer, 'PriceOracle', await controller.oracle()) as PriceOracle;

  const markets = await controller.getAllMarkets();
  console.log('markets', markets.length);
  // console.log(markets);


  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '18') {
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


  let infos: string = 'idx, csToken_name, csToken_address, token, tokenName, collateralFactor, borrowTarget, tvl, supplyCap, vault, cur rewards \n';
  for (let i = 0; i < markets.length; i++) {
    if(exclude.has(i)) {
      continue;
    }
    console.log('id', i);
    const scTokenAdr = markets[i];
    const scTokenName = await TokenUtils.tokenSymbol(scTokenAdr);
    console.log('scTokenName', scTokenName, scTokenAdr)
    const scTokenCtr = await DeployerUtils.connectInterface(signer, 'CompleteRToken', scTokenAdr) as CompleteRToken;

    const undPrice = +utils.formatUnits(await priceOracle.getUnderlyingPrice(scTokenAdr));
    console.log(' >> undPrice', undPrice);
    const token = await scTokenCtr.underlying();
    const tokenName = await TokenUtils.tokenSymbol(token);
    const collateralFactor = +utils.formatUnits((await controller.markets(scTokenAdr)).collateralFactorMantissa) * 10000;
    const borrowTarget = Math.floor(collateralFactor * 0.99);
    const undDec = await TokenUtils.decimals(token);
    const supplyCap = await controller.supplyCaps(scTokenAdr);
    console.log(' >> supplyCap', supplyCap.toString())
    const cash = +utils.formatUnits(await scTokenCtr.getCash(), undDec);
    const borrowed = +utils.formatUnits(await scTokenCtr.totalBorrows(), undDec);
    const reserves = +utils.formatUnits(await scTokenCtr.totalReserves(), undDec);

    const tvl = (cash + borrowed - reserves) * undPrice;

    const data = i + ',' +
      scTokenName + ',' +
      scTokenAdr + ',' +
      token + ',' +
      tokenName + ',' +
      (collateralFactor - 1) + ',' +
      borrowTarget + ',' +
      tvl.toFixed(2) + ',' +
      supplyCap + ',' +
      underlyingToVault.get(token.toLowerCase()) + ',' +
      currentRewards.get(token.toLowerCase())


    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/scream_markets.csv', infos, 'utf8');
  console.log('done');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
