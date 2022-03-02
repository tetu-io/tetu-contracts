import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DoHardWorkLoopBase} from "./DoHardWorkLoopBase";
import {IStrategy__factory, StrategySplitter__factory} from "../../typechain";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

export class SplitterDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    const start = Date.now();

    const splitter = StrategySplitter__factory.connect(this.strategy.address, this.signer);

    const r = await splitter.rebalanceAll();
    const rr = await r.wait();
    console.log('rebalance gas used', rr.gasUsed.toString())
    // expect(rr.gasUsed.toNumber()).is.lessThan(9_000_000);

    const strats = await splitter.allStrategies();
    for (const strat of strats) {
      const platfrom = await IStrategy__factory.connect(strat, this.signer).platform()
      if (platfrom === 24) {
        const s = StrategySplitter__factory.connect(strat, this.signer);
        await s.rebalanceAll();
      }
    }

    Misc.printDuration('Loop preparation for splitter completed', start);
  }

}
