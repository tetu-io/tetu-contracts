import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {Multicall, TradeBot, TradeBot1Inch} from "../../../typechain";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const contract = await DeployerUtils.deployContract(signer, "TradeBot1Inch", '0x1111111254EEB25477B68fb85Ed929f73A960582', '0x0644141DD9C2c34802d28D334217bD2034206Bf7','0xb70CF120fb4461F77bbB189b125131e3D5234266') as TradeBot1Inch;
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
