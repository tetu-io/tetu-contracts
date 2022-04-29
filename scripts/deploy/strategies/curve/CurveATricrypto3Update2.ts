import {ethers, network} from "hardhat";
import {updateCurveStrategy,} from "./utils/CurveUpdateLogic";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

/**
 * Deploy new version of CurveATriCrypto3Strategy to Matic
 * Save address of new strategy to ./tmp/update/strategies.txt
 */
async function main() {
  console.log("network.name", network.name);

  const vaultNameWithoutPrefix = "CRV_ATC3";
  const strategyName = 'CurveATriCrypto3Strategy';
  const strategyContractPath = 'contracts/strategies/matic/curve/CurveATriCrypto3Strategy.sol:CurveATriCrypto3Strategy';
  const token: string = MaticAddresses.USD_BTC_ETH_CRV_TOKEN;

  await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
