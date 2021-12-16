import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {SingleTokenVaultStrategyDeploy} from "../SingleTokenVaultStrategyDeploy";

async function main() {
  await SingleTokenVaultStrategyDeploy.deploy(
    MaticAddresses.KLIMA_TOKEN,
    'KLIMA',
    'StrategyKlimaStaking'
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
