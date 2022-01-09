import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {DeployStubVault} from "../DeployStubVault";

async function main() {
  await DeployStubVault.deploy(
    'SFF',
    MaticAddresses.SFF_TOKEN,
    22
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
