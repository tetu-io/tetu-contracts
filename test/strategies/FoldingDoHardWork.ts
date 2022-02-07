import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DoHardWorkLoopBase} from "./DoHardWorkLoopBase";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {FoldingBase} from "../../typechain";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

export class FoldingDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    const start = Date.now();
    const foldContract = await DeployerUtils.connectInterface(this.signer, 'FoldingBase', this.strategy.address) as FoldingBase
    let foldingState = (await foldContract.foldState()).toNumber();
    // switch off folding on the 1/3 of cycles
    if (i === Math.floor(this.loops / 3) && foldingState !== 2) {
      await foldContract.setFold(2);
      foldingState = (await foldContract.foldState()).toNumber();
      expect(foldingState).is.eq(2);
    } else if (i === Math.floor(this.loops / 3) * 2 && foldingState !== 1) { // switch on folding on the 2/3 of cycles
      await foldContract.setFold(1);
      foldingState = (await foldContract.foldState()).toNumber();
      expect(foldingState).is.eq(1);
    } else if (foldingState !== 0) {
      await foldContract.setFold(0);
    }
    console.log('------ FOLDING', 'cycle:' + i, 'enabled:' + foldingState, 'profitable:' + await foldContract.isFoldingProfitable());
    if((await foldContract.rewardPoolBalance()).gt(100000)) {
      console.log('try manualRedeemMax')
      await foldContract.manualRedeemMax();
      console.log('try rebalance')
      await foldContract.rebalance();
      console.log('try manualSupply')
      await foldContract.manualSupply(10000);
      console.log('try manualBorrow')
      await foldContract.manualBorrow(10);
      console.log('try manualRepay')
      await foldContract.manualRepay(10);
      console.log('try manualRedeem')
      await foldContract.manualRedeem(10);
    }
    Misc.printDuration('Loop preparation for folding completed', start);
  }

}
