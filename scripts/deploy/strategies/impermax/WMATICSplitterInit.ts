import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {StrategyImpermax, StrategyImpermax__factory} from "../../../../typechain";
import {appendFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  // ** CONFIG
  // todo splitterAddress
  const splitterAddress = ''
  const controller = core.controller;
  const underlying = MaticAddresses.WMATIC_TOKEN;
  const name = 'IMPERMAX_WMATIC';
  // *****************************

  const impermaxes = await DeployerUtils.deployImpermaxLikeStrategies(
      signer,
      controller,
      splitterAddress,
      underlying,
      'StrategyImpermax',
      'scripts/utils/download/data/impermax.csv',
      100_000
  );


  if (impermaxes.length === 0) {
    throw new Error('NO IMX');
  }

  for (const imx of impermaxes) {
    const tCtr = StrategyImpermax__factory.connect(imx, signer);
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
    await DeployerUtils.verifyWithContractName(imx, 'contracts/strategies/matic/impermax/StrategyImpermax.sol:StrategyImpermax', strategyArgs);
    const txt = `${name}:     splitter: ${splitterAddress}     strategy: ${imx}\n`;
    appendFileSync(`./tmp/deployed/splitter_strats.txt`, txt, 'utf8');
  }
}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
