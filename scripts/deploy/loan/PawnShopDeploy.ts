import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {TetuPawnShop} from "../../../typechain";
import {Misc} from "../../utils/tools/Misc";
import {parseUnits} from "ethers/lib/utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const gov = await DeployerUtils.getGovernance()

  const args = [gov, '0x8E26101F11e43BD6d6b3A84E3A32e8194953A123', parseUnits('1'), gov];

  const contract = await DeployerUtils.deployContract(signer, "TetuPawnShop", ...args) as TetuPawnShop;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, args);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
