import {web3} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";

export class Web3Utils {


  public static async parseLogs(contracts: string[], topics: string[], start: number, end: number, step = 3_000) {
    const logs = [];

    console.log('parseLogs', start, end);
    let from = start;
    let to = start + step;
    while (true) {
      try {
        logs.push(...(await web3.eth.getPastLogs({
          fromBlock: from,
          toBlock: to,
          address: contracts,
          "topics": topics
        })));

        console.log('logs', from, to, logs.length);

        from = to;
        to = Math.min(from + step, end);

        if (from >= end) {
          break;
        }
      } catch (e) {
        console.log('Error fetch logs', e);
        await DeployerUtils.delay(1000);
      }
    }

    return logs;
  }

}
