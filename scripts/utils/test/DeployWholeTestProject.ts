import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {utils} from "ethers";
import {RunHelper} from "../RunHelper";
import {VaultUtils} from "../../../test/VaultUtils";
import CoreContractsDeploy from "../../deploy/base/CoreContractsDeploy";
import {Addresses} from "../../../addresses";

async function main() {
  const core = await CoreContractsDeploy();

  // Addresses.CORE.set()

 }

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
