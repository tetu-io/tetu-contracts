import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.newStratDeploy(
      signer,
      'QUICK_WETH_WMATIC',
      'StrategyQuickEthMatic'
  );
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
