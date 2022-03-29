import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {IStrategy} from "../../../../typechain";
import {MaticAddresses} from "../../../addresses/MaticAddresses";


const UNDERLYING = MaticAddresses.UMA_TOKEN;
const VAULT = '0xE19748d6D8d6A7c5aF5553BB014A99B25024b8d8';
const PLATFORM = 34;

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
