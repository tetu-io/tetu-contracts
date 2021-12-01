import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Multicall} from "../../../typechain";
import {ethers} from "hardhat";
import {Logger} from "tslog";
import logSettings from "../../../log_settings";

const log: Logger = new Logger(logSettings);

export class Misc {
  public static readonly SECONDS_OF_DAY = 60 * 60 * 24;
  public static readonly SECONDS_OF_YEAR = Misc.SECONDS_OF_DAY * 365;
  public static readonly ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  public static printDuration(text: string, start: number) {
    log.info('>>>' + text, ((Date.now() - start) / 1000).toFixed(1), 'sec');
  }

  public static async getBlockTsFromChain(): Promise<number> {
    const signer = (await ethers.getSigners())[0];
    const tools = await DeployerUtils.getToolsAddresses();
    const ctr = await DeployerUtils.connectInterface(signer, 'Multicall', tools.multicall) as Multicall;
    const ts = await ctr.getCurrentBlockTimestamp();
    return ts.toNumber();
  }

}
