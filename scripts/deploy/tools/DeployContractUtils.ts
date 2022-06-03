import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractUtils} from "../../../typechain";

// latest deployed by bogdoslav
// Deploy tx: 0x624d00e2112edc3026701a3251ae3e890b8add479cc2d0fd46cdf1d9d154f1e1
// 2022-06-01 17:46:59.035 >>>ContractUtils deployed 0xd933B5943B82806C638df8c0C88dC0930Dd13bE4 gas used: 1422306 10.4 sec


async function main() {
  const signer = (await ethers.getSigners())[0];

  const contract = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
