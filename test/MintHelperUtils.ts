import {utils} from "ethers";
import {Announcer, Controller} from "../typechain";
import {TimeUtils} from "./TimeUtils";

export class MintHelperUtils {

  public static async mint(controller: Controller, announcer: Announcer, amount: string, destination: string, period = 60 * 60 * 48) {
    console.log("mint reward tokens", amount)
    await announcer.announceMint(utils.parseUnits(amount), destination, destination, false);

    await TimeUtils.advanceBlocksOnTs(period);

    await controller.mintAndDistribute(utils.parseUnits(amount), destination, destination, false);
  }

  public static async mintAll(controller: Controller, announcer: Announcer, destination: string, period = 60 * 60 * 48 + 1) {

    await announcer.announceMint(0, destination, destination, true);

    await TimeUtils.advanceBlocksOnTs(period);

    await controller.mintAndDistribute(0, destination, destination, true);
  }

}
