import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Multicall, TradeBot, TradeBot1Inch} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const contract = await DeployerUtils.deployContract(signer, "TradeBot1Inch", '0x1111111254EEB25477B68fb85Ed929f73A960582') as TradeBot1Inch;
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
