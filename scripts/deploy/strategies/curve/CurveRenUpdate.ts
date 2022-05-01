import {ethers, network} from "hardhat";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";

/**
 * Deploy new version of CurveRenStrategy to Matic
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_REN";
  const strategyName = 'CurveRenStrategy';
  const strategyContractPath = 'contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy';
  const token: string = MaticAddresses.BTCCRV_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
