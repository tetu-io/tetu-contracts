import { McLpStrategyDeployer } from "../McLpStrategyDeployer";
import { MaticAddresses } from "../../../addresses/MaticAddresses";

async function main() {
  await McLpStrategyDeployer.deploy(
    MaticAddresses.COSMIC_COSMIC_USDC,
    0,
    "COSMIC",
    "StrategyCosmicSwapLp",
    "contracts/strategies/matic/cosmic/StrategyCosmicSwapLp.sol:StrategyCosmicSwapLp"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
