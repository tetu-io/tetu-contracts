import {web3} from "hardhat";

export class Web3Utils {


  public static async parseLogs(contract: string, topics: string[], start: number, end: number, step = 50_000) {
    const logs = [];
    try {
      console.log(start, end);
      let from = start;
      let to = start + step;
      while (true) {
        logs.push(...(await web3.eth.getPastLogs({
          fromBlock: from,
          toBlock: to,
          address: contract,
          topics: topics
        })));
        console.log('logs', from, to, logs.length);

        from = to;
        to = from + step;

        if (to >= end) {
          break;
        }
      }
    } catch (e) {
      console.log('Error fetch logs', e);
    }
    return logs;
  }

}
