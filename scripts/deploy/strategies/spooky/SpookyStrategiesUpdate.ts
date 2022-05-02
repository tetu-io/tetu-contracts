import {ethers, network} from "hardhat";
import {appendFileSync} from "fs";
import {updateSpookyStrategy} from "./utils/SpookyUpdateLogic";
import {prepateFileToSaveUpdatedStrategies} from "../StratUpdateUtils";


async function main() {
  console.log("network.name", network.name);

  const spookyPoolsCsv = 'scripts/utils/download/data/spooky_pools.csv';
  const destUpdateTxt = `./tmp/update/strategies.txt`;
  const strategyName = 'StrategySpookySwapLp';
  const strategyContractPath = 'contracts/strategies/fantom/spooky/StrategySpookySwapLp.sol:StrategySpookySwapLp';

  prepateFileToSaveUpdatedStrategies(destUpdateTxt);
  updateSpookyStrategy(
    spookyPoolsCsv
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
