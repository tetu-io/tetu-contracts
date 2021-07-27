import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {utils} from "ethers";
import {UniswapUtils} from "../../../test/UniswapUtils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tokens = await DeployerUtils.getTokenAddresses();

  const lpAddress = await UniswapUtils.addLiquidity(
      signer,
      core.rewardToken,
      tokens.get('usdc') as string,
      utils.parseUnits('1000', 18).toString(),
      utils.parseUnits('1000', 6).toString(),
      MaticAddresses.SUSHI_FACTORY,
      MaticAddresses.SUSHI_ROUTER,
      true
  );
  console.log('lpAddress', lpAddress);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
