import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {DeployStubVault} from "../DeployStubVault";

async function main() {
  await DeployStubVault.deploy(
    'CLAM2',
    MaticAddresses.CLAM2_TOKEN,
    37
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
