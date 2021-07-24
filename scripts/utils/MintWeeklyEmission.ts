import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer, Controller, RewardToken} from "../../typechain";
import {BigNumber, utils} from "ethers";
import {RunHelper} from "./RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const token = await DeployerUtils.connectContract(
      signer, "RewardToken", core.rewardToken) as RewardToken;
  const announcer = await DeployerUtils.connectContract(signer, "Announcer", core.announcer) as Announcer;
  const week = (await token.currentWeek()).toNumber();
  console.log('current week', week);

  const annIdx = await announcer.timeLockIndexes('16');

  if (annIdx.isZero()) {
    console.log('Announce Mint');
    let toMint = (await token.maxTotalSupplyForCurrentBlock()).sub(await token.totalSupply());
    if (toMint.isZero()) {
      // first week
      toMint = BigNumber.from('');
    }

    console.log('To mint', utils.formatUnits(toMint, 18));
    await RunHelper.runAndWait(() => announcer.announceMint(toMint, core.notifyHelper, core.fundKeeper));
  } else {
    console.log('Mint announced', annIdx)
    const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;

    const annInfo = await announcer.timeLockInfos(annIdx);
    console.log('annInfo', annInfo);

    if (annInfo.opCode != 16) {
      throw Error('Wrong opcode!');
    }
    //todo strange behavior of model

    // const amount;
    // const distibutor = annInfo.adrValues;
    // const fund;

    // controller.mintAndDistribute()

  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
