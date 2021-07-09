import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {MintHelper, RewardToken} from "../../typechain";
import {utils} from "ethers";
import {RunHelper} from "./RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const token = await DeployerUtils.connectContract(
      signer, "RewardToken", core.rewardToken) as RewardToken;
  const mintHelper = await DeployerUtils.connectContract(
      signer, "MintHelper", core.mintHelper) as MintHelper;
  const week = (await token.currentWeek()).toNumber();
  console.log('current week', week);
  //start emission
  if (week === 0) {
    await RunHelper.runAndWait(() => mintHelper.startMinting());
  }
  const toMint = (await token.maxTotalSupplyForCurrentBlock()).sub(await token.totalSupply());
  console.log('to mint', utils.formatUnits(toMint, 18))
  await mintHelper.mint(toMint);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
