import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {IStrategy} from "../../../typechain";

const UNDERLYING = MaticAddresses.BALANCER_POOL_tetuBAL_BPT;
const VAULT = '0x3B703E4301A56128f45fA17304eF9e1B5e0f3523';
const PLATFORM = 36;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const strategyArgs = [
    core.controller, // _controller
    UNDERLYING, // _underlying
    VAULT, // _vault
    [], // __rewardTokens
    [UNDERLYING], // __assets
    PLATFORM, // __platform
  ];

  const strategy = await DeployerUtils.deployContract(
    signer,
    'NoopStrategy',
    ...strategyArgs
  ) as IStrategy;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(strategy.address, strategyArgs);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
