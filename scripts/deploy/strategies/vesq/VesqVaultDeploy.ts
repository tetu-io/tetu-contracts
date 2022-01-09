import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {SingleTokenVaultStrategyDeploy} from "../SingleTokenVaultStrategyDeploy";

async function main() {
  await SingleTokenVaultStrategyDeploy.deploy(
    MaticAddresses.VSQ_TOKEN,
    'VSQ',
    'StrategyVesqStaking'
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
