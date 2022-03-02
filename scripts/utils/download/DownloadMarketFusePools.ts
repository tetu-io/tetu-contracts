import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IFusePoolDirectory, IFusePoolLens, PriceCalculator__factory,
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {utils} from "ethers";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const fusePoolDirectory = await DeployerUtils.connectInterface(signer, 'IFusePoolDirectory', MaticAddresses.MARKET_POOLDIRECTORY) as IFusePoolDirectory;
  // MARKET_POOLLENS address marked as deprecated in docs, but it's used here: https://github.com/marketxyz/market-dApp/blob/master/src/fuse-sdk/src/addrs.js
  const fusePoolLens = await DeployerUtils.connectInterface(signer, 'IFusePoolLens', MaticAddresses.MARKET_POOLLENS) as IFusePoolLens;
  const tokens = await fusePoolDirectory.getAllPools();
  console.log('Lending pools', tokens.length);

  let infos: string = 'idx,comptroller,name,token_adr,pool_adr,tvl,borrowed,utilization\n';
  console.log('infos', infos);
  const calculator = PriceCalculator__factory.connect(tools.calculator, signer);
  for (let i = 0; i < tokens.length; i++) {
    // skip pool with id = 4, as it has only Moo Curve tokens
    if (i === 4) {continue}
    // skip empty pools
    if (i === 6 || i === 7) {continue}
    console.log('id', i);
    const pool = tokens[i];
    console.log('pool', pool.name);
    const poolInfo = await fusePoolLens.callStatic.getPoolAssetsWithData(pool.comptroller,{gasLimit: '10000000000000'});
    for (const info of poolInfo) {
      // skip Moo Curve tokens
      if (info.underlyingToken === '0x5A0801BAd20B6c62d86C566ca90688A6b9ea1d3f' || info.underlyingToken === '0xC1A2e8274D390b67A7136708203D71BF3877f158'
      || info.underlyingToken === '0xAA7C2879DaF8034722A0977f13c343aF0883E92e' || info.underlyingToken === '0x8c9d3Bc4425773BD2F00C4a2aC105c5Ad73c8141'){
        continue
      }
      console.log(info);
      const totalSupply = +utils.formatUnits(info.totalSupply, info.underlyingDecimals);
      const totalBorrowed = +utils.formatUnits(info.totalBorrow, info.underlyingDecimals);
      const price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(info.underlyingToken));
      console.log(price);
      const tvl = totalSupply * price;
      const borrowed = totalBorrowed * price;
      const utilization = (borrowed / tvl) * 100;
      const data = i + ','
      + pool.comptroller + ','
      + info.underlyingName + ','
      + info.underlyingToken + ','
      + info.cToken + ','
      + tvl.toFixed(0) + ','
      + borrowed.toFixed(0) + ','
      + utilization.toFixed(2)
      + '\n'
      console.log(data);
      infos += data;
    }
  }
  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  writeFileSync('./tmp/download/market.csv', infos, 'utf8');
  console.log('done');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
