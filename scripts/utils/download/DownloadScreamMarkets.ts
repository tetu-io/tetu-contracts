import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  CompleteRToken,
  IScreamController,
  PriceOracle,
} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {utils} from "ethers";
import {FtmAddresses} from "../../addresses/FtmAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const controller = await DeployerUtils.connectInterface(signer, 'IScreamController', FtmAddresses.SCREAM_CONTROLLER) as IScreamController;
  const priceOracle = await DeployerUtils.connectInterface(signer, 'PriceOracle', await controller.oracle()) as PriceOracle;

  const markets = await controller.getAllMarkets();
  console.log('markets', markets.length);
  console.log(markets);

  let infos: string = 'idx, csToken_name, csToken_address, token, tokenName, collateralFactor, borrowTarget, tvl, supplyCap \n';
  for (let i = 0; i < markets.length; i++) {
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
      supplyCap


    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/iron_markets.csv', infos, 'utf8');
  console.log('done');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
