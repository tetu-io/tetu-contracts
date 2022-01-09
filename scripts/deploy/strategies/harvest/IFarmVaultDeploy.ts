import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {DeployStubVault} from "../DeployStubVault";

async function main() {
  await DeployStubVault.deploy(
    'miFARM',
    MaticAddresses.miFARM_TOKEN,
    17
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
