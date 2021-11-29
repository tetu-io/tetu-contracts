import {McLpStrategyDeployer} from "../McLpStrategyDeployer";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

async function main() {
  await McLpStrategyDeployer.deploy(
      MaticAddresses.HERMES_IRIS_TETU,
      21,
      'HERMES',
      'StrategyHermesSwapLp',
      'contracts/strategies/matic/hermes/StrategyHermesSwapLp.sol:StrategyHermesSwapLp'
  );
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
