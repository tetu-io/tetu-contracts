import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {FtmAddresses} from "../../../addresses/FtmAddresses";
import {
  Controller__factory,
  StrategySplitter__factory,
  StrategyTarot__factory
} from "../../../../typechain";
import {appendFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  // ** CONFIG
  const splitterAddress = '0x5364A521a6052842450b1EA60D981608cB6B0B88'
  const controller = core.controller;
  const underlying = FtmAddresses.TOMB_TOKEN;
  const name = 'TAROT_TOMB';
  // *****************************

  const tarots = await DeployerUtils.deployImpermaxLikeStrategies(
    signer,
    controller,
    splitterAddress,
    underlying,
    'StrategyTarot',
    'scripts/utils/download/data/tarot.csv'
  );

  // const tarots = ['0xc2772Af3949133163C222c172486aE1FbC3e2bD2'];

  if (tarots.length === 0) {
    throw new Error('NO TAROTS');
  }

  for (const tarot of tarots) {
    const tCtr = StrategyTarot__factory.connect(tarot, signer);
    const vaultAddress = await tCtr.vault();
    const poolAdr = await tCtr.pool();
    const buyBackRatio = await tCtr.buyBackRatio();
    const strategyArgs = [
      controller,
      vaultAddress,
      underlying,
      poolAdr,
      buyBackRatio
    ];
    await DeployerUtils.verifyWithContractName(tarot, 'contracts/strategies/fantom/tarot/StrategyTarot.sol:StrategyTarot', strategyArgs);
    const txt = `${name}:     splitter: ${splitterAddress}     strategy: ${tarot}\n`;
    appendFileSync(`./tmp/deployed/splitter_strats.txt`, txt, 'utf8');
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
