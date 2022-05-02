import {ethers, network} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {IStrategy} from "../../../../typechain";
import {appendFileSync, readFileSync} from "fs";
import {
  deploySingleStrategy,
  findAllVaults, prepateFileToSaveUpdatedStrategies,
  saveUpdatedStrategiesToFile,
  verifySingleStrategy
} from "../curve/utils/CurveUpdateUtils";
import {makePrepareUpgrade} from "@openzeppelin/hardhat-upgrades/dist/prepare-upgrade";
import {updateSpookyStrategy} from "./utils/SpookyUpdateLogic";


async function main() {
  console.log("network.name", network.name);

  const destUpdateTxt = `./tmp/update/strategies.txt`;
  const strategyName = 'StrategySpookySwapLp';
  const strategyContractPath = 'contracts/strategies/fantom/spooky/StrategySpookySwapLp.sol:StrategySpookySwapLp';

  prepateFileToSaveUpdatedStrategies(destUpdateTxt);
  updateSpookyStrategy(
    'scripts/utils/download/data/spooky_pools.csv'
    , strategyName
    , strategyContractPath
    , (vaultNameWithoutPrefix, vaultAddress, strategy) => {
      const txt = `${vaultNameWithoutPrefix}:     vault: ${vaultAddress}     strategy: ${strategy.address}\n`;
      appendFileSync(destUpdateTxt, txt, 'utf8');
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
