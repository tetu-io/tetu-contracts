import {network} from "hardhat";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

/**
 * Deploy new version of CurveAaveStrategy to Matic
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_AAVE";
  const strategyName = 'CurveAaveStrategy';
  const strategyContractPath = 'contracts/strategies/matic/curve/CurveAaveStrategy.sol:CurveAaveStrategy';
  const token: string = MaticAddresses.AM3CRV_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
