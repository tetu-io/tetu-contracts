import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {readFileSync} from "fs";
import {startIronFoldStrategyTest} from "../../IronFoldStrategyTest";
import {config as dotEnvConfig} from "dotenv";
import {startAaveFoldStrategyTest} from "./AaveFoldStrategyTest";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IAaveProtocolDataProvider, IAToken, PriceCalculator, SmartVault} from "../../../../typechain";
import {ethers} from "hardhat";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
.env('TETU')
.options({
  disableStrategyTests: {
    type: "boolean",
    default: false,
  },
  onlyOneAaveFoldStrategyTest: {
    type: "number",
    default: 0,
  }
}).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal Aave Fold tests', async () => {

  if (argv.disableStrategyTests) {
    return;
  }
  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  infos.forEach(info => {
    const strat = info.split(',');

    const idx = strat[0];
    const aTokenName = strat[1];
    const aTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    // const collateralFactor = strat[5];
    // const borrowTarget = strat[6];

    const collateralFactor = '6499'; //todo add real data
    const borrowTarget = '5850';   //todo add real data

    // if (!idx || idx === 'idx' || collateralFactor === '0') {
    if (!idx || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    // if (argv.onlyOneAaveFoldStrategyTest !== -1 && parseFloat(idx) !== argv.onlyOneAaveFoldStrategyTest) {
    //   return;
    // }

    console.log('strat', idx, aTokenName);

    /* tslint:disable:no-floating-promises */
    startAaveFoldStrategyTest(
        'StrategyAaveFold',
        MaticAddresses.DFYN_FACTORY,
        token.toLowerCase(),
        tokenName,
        [MaticAddresses.ICE_TOKEN],
        aTokenAddress,
        borrowTarget,
        collateralFactor
    );
  });
});
