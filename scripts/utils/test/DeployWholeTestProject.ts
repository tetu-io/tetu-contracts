import CoreContractsDeploy from '../../deploy/base/CoreContractsDeploy';

async function main() {
  const core = await CoreContractsDeploy();

  // Addresses.CORE.set()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
