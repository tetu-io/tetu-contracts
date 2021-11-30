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
    let folding = await foldContract.foldEnabled();
    // switch off folding on the 1/3 of cycles
    if (i === Math.floor(this.loops / 3) && folding) {
      await foldContract.setFold(false);
      await foldContract.rebalance();
      folding = await foldContract.foldEnabled();
      expect(folding).is.eq(false);
    }
    // switch on folding on the 2/3 of cycles
    if (i === Math.floor(this.loops / 3) * 2 && !folding) {
      await foldContract.setFold(true);
      await foldContract.rebalance();
      folding = await foldContract.foldEnabled();
      expect(folding).is.eq(true);
    }
    console.log('------ FOLDING', 'cycle:' + i, 'enabled:' + folding, 'profitable:' + await foldContract.isFoldingProfitable());
    Misc.printDuration('Loop preparation for folding completed', start);
  }

}
