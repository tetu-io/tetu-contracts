import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {EthAddresses} from "../../../addresses/EthAddresses";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const balStrategy = '0x308A756B4f9aa3148CaD7ccf8e72c18C758b2EF2';

  const args = [
    core.controller,
    balStrategy,
    EthAddresses.BALANCER_GAUGE_CONTROLLER,
    EthAddresses.BALANCER_FEE_DISTRIBUTOR,
  ];

  const locker = await DeployerUtils.deployContract(signer, 'BalLocker', ...args);

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(locker.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
