import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DoHardWorkLoopBase} from "../../../DoHardWorkLoopBase";
import {CurveUtils} from "./CurveUtils";
import {ethers} from "hardhat";

const {expect} = chai;
chai.use(chaiAsPromised);

export class CurveDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    await CurveUtils.swapTokens((await ethers.getSigners())[3], this.underlying);
  }

}
