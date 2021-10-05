import {utils} from "ethers";
import {Announcer, Controller} from "../typechain";
import {TimeUtils} from "./TimeUtils";

export class MintHelperUtils {

  public static async mint(controller: Controller, announcer: Announcer, amount: string, destination: string) {

    await announcer.announceMint(utils.parseUnits(amount), destination, destination, false);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);

    await controller.mintAndDistribute(utils.parseUnits(amount), destination, destination, false);
  }

  public static async mintAll(controller: Controller, announcer: Announcer, destination: string) {

    await announcer.announceMint(0, destination, destination, true);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7 + 1);

    await controller.mintAndDistribute(0, destination, destination, true);
  }

}
