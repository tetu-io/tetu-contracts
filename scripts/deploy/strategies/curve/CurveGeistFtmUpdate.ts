import {ethers, network} from "hardhat";
import {FtmAddresses} from "../../../addresses/FtmAddresses";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";

/**
 * Deploy new version of CurveGeistStrategy to Fantom
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_GEIST";
  const strategyName = 'CurveGeistStrategy';
  const strategyContractPath = 'contracts/strategies/fantom/curve/CurveGeistStrategy.sol:CurveGeistStrategy';
  const token = FtmAddresses.g3CRV_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
