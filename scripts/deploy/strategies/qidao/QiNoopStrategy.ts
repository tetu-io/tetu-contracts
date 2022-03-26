import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {IStrategy} from "../../../../typechain";

async function main() {

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const args = [
    core.controller, // _controller
    MaticAddresses.QI_TOKEN, // _underlying
    '0x5B34773b4cE2719c7b707C7675d64ff15B33Bd92', // _vault
    [], // __rewardTokens
    [MaticAddresses.QI_TOKEN], // __assets
    21, // __platform
  ];

  const strategy = await DeployerUtils.deployContract(
    signer,
    'NoopStrategy',
    ...args
  ) as IStrategy;

  await DeployerUtils.verifyWithArgs(strategy.address, args);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
