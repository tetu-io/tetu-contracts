import {network} from "hardhat";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";
import {FtmAddresses} from "../../../addresses/FtmAddresses";

/**
 * Deploy new version of Curve2PoolStrategy to Fantom
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_2POOL";
  const strategyName = 'Curve2PoolStrategy';
  const strategyContractPath = 'contracts/strategies/fantom/curve/Curve2PoolStrategy.sol:Curve2PoolStrategy';
  const token: string = FtmAddresses._2poolCrv_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
