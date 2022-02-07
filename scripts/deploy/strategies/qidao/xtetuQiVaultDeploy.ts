import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {DeployStubVault} from "../DeployStubVault";

async function main() {
  await DeployStubVault.deploy(
    'tetuQi',
    '0x4Cd44ced63d9a6FEF595f6AD3F7CED13fCEAc768', // tetuQi vault
    21
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
