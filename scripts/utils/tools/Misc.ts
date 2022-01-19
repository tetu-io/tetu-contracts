import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Multicall} from "../../../typechain";
import {ethers} from "hardhat";
import {Logger} from "tslog";
import Common from "ethereumjs-common";
import logSettings from "../../../log_settings";

const log: Logger = new Logger(logSettings);

const MATIC_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'matic',
    networkId: 137,
    chainId: 137
  },
  'petersburg'
);

const FANTOM_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'fantom',
    networkId: 250,
    chainId: 250
  },
  'petersburg'
);

export class Misc {
  public static readonly SECONDS_OF_DAY = 60 * 60 * 24;
  public static readonly SECONDS_OF_YEAR = Misc.SECONDS_OF_DAY * 365;
  public static readonly ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  public static readonly GEIST_BOR_RATIO = 0.95;
  public static readonly AAVE_BOR_RATIO = 0.99;
  public static readonly IRON_BOR_RATIO = 0.99;

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

  public static async getChainConfig() {
    const net = await ethers.provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return MATIC_CHAIN;
      case 250:
        return FANTOM_CHAIN;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  public static platformName(n: number): string {
    switch (n) {
      case  0:
        return 'UNKNOWN'
      case  1:
        return 'TETU'
      case  2:
        return 'QUICK'
      case  3:
        return 'SUSHI'
      case  4:
        return 'WAULT'
      case  5:
        return 'IRON'
      case  6:
        return 'COSMIC'
      case  7:
        return 'CURVE'
      case  8:
        return 'DINO'
      case  9:
        return 'IRON_LEND'
      case 10:
        return 'HERMES'
      case 11:
        return 'CAFE'
      case 12:
        return 'TETU_SWAP'
      case 13:
        return 'SPOOKY'
      case 14:
        return 'AAVE_LEND'
      case 15:
        return 'AAVE_MAI_BAL'
      case 16:
        return 'GEIST'
      case 17:
        return 'HARVEST'
      case 18:
        return 'SCREAM_LEND'
      case 19:
        return 'KLIMA'
      case 20:
        return 'VESQ'
      case 21:
        return 'QIDAO'
      case 22:
        return 'SUNFLOWER'
    }
    return n + '';
  }

}
