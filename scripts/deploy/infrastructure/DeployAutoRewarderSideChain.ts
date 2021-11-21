import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {RunHelper} from "../../utils/RunHelper";
import {utils} from "ethers";
import {AutoRewarder, AutoRewarderSideChain, TetuProxyGov} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const logic = await DeployerUtils.deployContract(signer, "AutoRewarderSideChain") as AutoRewarderSideChain;
  const proxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", logic.address) as TetuProxyGov;
  const contract = logic.attach(proxy.address) as AutoRewarder;
  await contract.initialize(core.controller, core.rewardCalculator, utils.parseUnits('0'), utils.parseUnits('50000'));
  const data =  [contract, proxy, logic];

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(data[2].address);
  await DeployerUtils.verifyWithArgs(data[1].address, [data[2].address]);
  await DeployerUtils.verifyProxy(data[1].address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
