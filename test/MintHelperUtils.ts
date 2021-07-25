import {utils} from "ethers";
import {Announcer, Controller} from "../typechain";
import {TimeUtils} from "./TimeUtils";

export class MintHelperUtils {

  public static async mint(controller: Controller, announcer: Announcer, amount: string, destination: string) {

    await announcer.announceMint(utils.parseUnits(amount), destination, destination);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);

    await controller.mintAndDistribute(utils.parseUnits(amount), destination, destination);
  }

}
