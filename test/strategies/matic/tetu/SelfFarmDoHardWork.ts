import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {SmartVault__factory, StrategyTetuSelfFarm__factory} from "../../../../typechain";

const {expect} = chai;
chai.use(chaiAsPromised);


export class SelfFarmDoHardWork extends DoHardWorkLoopBase {

  public async afterBlockAdvance() {
    await super.afterBlockAdvance();
    const s = StrategyTetuSelfFarm__factory.connect(this.strategy.address, this.signer);
    const farmableVault = await s.farmableVault();
    await this.core.controller.doHardWork(farmableVault);
  }

}
