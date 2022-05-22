import {network} from "hardhat";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";
import {FtmAddresses} from "../../../addresses/FtmAddresses";

/**
 * Deploy new version of CurveRenFtmStrategy to Fantom
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_REN";
  const strategyName = 'CurveRenFtmStrategy';
  const strategyContractPath = 'contracts/strategies/fantom/curve/CurveRenFtmStrategy.sol:CurveRenFtmStrategy';
  const token: string = FtmAddresses.renCRV_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
