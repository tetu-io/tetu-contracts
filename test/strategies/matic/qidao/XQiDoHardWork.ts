import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);


export class XQiDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    const ppfsBefore = await this.vault.getPricePerFullShare();
    console.log('ppfs before transfer QI', ppfsBefore.toString());
    await TokenUtils.getToken(MaticAddresses.QI_TOKEN, this.underlying, utils.parseUnits('1000'))
    const ppfsAfter = await this.vault.getPricePerFullShare();
    console.log('ppfs after transfer QI', ppfsAfter.toString());
    expect(ppfsBefore).is.eq(ppfsAfter);
  }

  public async afterBlockAdvance() {
    await super.afterBlockAdvance();
    await this.core.controller.doHardWork(this.underlying);
  }

}
