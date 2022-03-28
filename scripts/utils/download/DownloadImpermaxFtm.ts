import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
  IBorrowable__factory,
  IFactory__factory,
  IPoolToken__factory,
  PriceCalculator__factory,
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {utils} from "ethers";
import {TokenUtils} from "../../../test/TokenUtils";
import {FtmAddresses} from "../../addresses/FtmAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const factory = IFactory__factory.connect(FtmAddresses.IMPERMAX_FACTORY, signer);

  const tokensLength = (await factory.allLendingPoolsLength()).toNumber();
  console.log('Lending tokens', tokensLength);

  let infos: string = 'idx,lp,name,token_adr,pool_adr,tvl,borrow,utilization\n';
  for (let i = 0; i < tokensLength; i++) {
    console.log('id', i);

    const lp = await factory.allLendingPools(i);
    // if (await isVault(lp, signer)) {
    //   continue;
    // }
    const poolInfo = await factory.getLendingPool(lp)
    // console.log('pool', lp, poolInfo);
    const data0 = i + ',' + lp + ',' + await collect(poolInfo.borrowable0, signer)
    console.log(data0);
    infos += data0 + '\n';

    const data1 = i + ',' + lp + ',' + await collect(poolInfo.borrowable1, signer)
    console.log(data1);
    infos += data1 + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/impermax_ftm.csv', infos, 'utf8');
  console.log('done');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });

async function collect(pool: string, signer: SignerWithAddress) {
  const tools = await DeployerUtils.getToolsAddresses();
  const calculator = PriceCalculator__factory.connect(tools.calculator, signer);

  const underlying = await poolUnderlying(pool, signer);
  const dec = await TokenUtils.decimals(underlying);
  const underlyingName = await TokenUtils.tokenSymbol(underlying);
  const price = +utils.formatUnits(await calculator.getPriceWithDefaultOutput(underlying));
  const tvl = await poolTvl(pool, dec, signer) * price;
  const borrowed = await poolBorrowed(pool, dec, signer) * price;
  const utilisation = ((borrowed / tvl) * 100).toFixed(2);
  return underlyingName + ','
      + underlying + ','
      + pool + ','
      + tvl.toFixed(0) + ','
      + borrowed.toFixed(0) + ','
      + utilisation
}

async function poolTvl(adr: string, dec: number, signer: SignerWithAddress) {
  const pool = IBorrowable__factory.connect(adr, signer);
  const rate = +utils.formatUnits(await pool.callStatic.exchangeRate());
  const totalSupply = +utils.formatUnits(await pool.totalSupply(), dec);
  return rate * totalSupply;
}

async function poolBorrowed(adr: string, dec: number, signer: SignerWithAddress) {
  const pool = IBorrowable__factory.connect(adr, signer);
  const rate = +utils.formatUnits(await pool.callStatic.exchangeRate());
  const amount = +utils.formatUnits(await pool.totalBorrows(), dec);
  return rate * amount;
}

async function poolUnderlying(adr: string, signer: SignerWithAddress) {
  const pool = IPoolToken__factory.connect(adr, signer);
  return pool.underlying();
}
