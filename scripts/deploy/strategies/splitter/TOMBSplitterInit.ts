import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {FtmAddresses} from "../../../addresses/FtmAddresses";
import {Controller__factory, StrategySplitter__factory} from "../../../../typechain";
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

  const controllerCtr = Controller__factory.connect(core.controller, signer);
  const splitterCtr = StrategySplitter__factory.connect(core.controller, signer);

  const tarots = await DeployerUtils.deployImpermaxLikeStrategies(
    signer,
    controller,
    splitterAddress,
    underlying,
    'StrategyTarot',
    'scripts/utils/download/data/tarot.csv'
  );

  if (tarots.length === 0) {
    throw new Error('NO TAROTS');
  }

  for (const tarot of tarots) {
    const txt = `${name}:     splitter: ${splitterAddress}     strategy: ${tarot}\n`;
    appendFileSync(`./tmp/deployed/splitter_strats.txt`, txt, 'utf8');
  }


  // await controllerCtr.addStrategiesToSplitter(splitterAddress, tarots);
  //
  // await splitterCtr.setStrategyRatios(
  //   tarots,
  //   tarotsRatios
  // );

}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
