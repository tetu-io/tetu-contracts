import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IFusePoolDirectory, IFusePoolLens, PriceCalculator__factory,
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {utils} from "ethers";
import {FtmAddresses} from "../../addresses/FtmAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const fusePoolDirectory = await DeployerUtils.connectInterface(signer, 'IFusePoolDirectory', FtmAddresses.MARKET_POOLDIRECTORY) as IFusePoolDirectory;
  const fusePoolLens = await DeployerUtils.connectInterface(signer, 'IFusePoolLens', FtmAddresses.MARKET_POOLLENS) as IFusePoolLens;
  const tokens = await fusePoolDirectory.getAllPools();
  console.log('Lending pools', tokens.length);

  let infos: string = 'idx,comptroller,name,token_adr,pool_adr,tvl,borrowed,utilization\n';
  console.log('infos', infos);
  const calculator = PriceCalculator__factory.connect(tools.calculator, signer);
  for (let i = 0; i < tokens.length; i++) {
    console.log('id', i);
    const pool = tokens[i];
    console.log('pool', pool.name);
    const poolInfo = await fusePoolLens.callStatic.getPoolAssetsWithData(pool.comptroller,{gasLimit: '10000000000000'});
    for (const info of poolInfo) {
      if (info.underlyingToken === '0xae94e96bF81b3a43027918b138B71a771D381150') {continue}
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

  writeFileSync('./tmp/download/market_ftm.csv', infos, 'utf8');
  console.log('done');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
