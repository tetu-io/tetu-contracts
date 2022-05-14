import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {StrategyBalStaking} from "../../../../typechain";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const strat = await DeployerUtils.deployContract(signer, 'StrategyBalStaking') as StrategyBalStaking;
  await DeployerUtils.wait(5);
  await DeployerUtils.verify(strat.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


