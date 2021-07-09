import {ethers} from "hardhat";
import {ContractTransaction} from "ethers";
import {DeployerUtils} from "../deploy/DeployerUtils";

export class RunHelper {

  public static async runAndWait(callback: () => Promise<ContractTransaction>, stopOnError = true, wait = true) {
    const tr = await callback();
    if (!wait) {
      return;
    }
    await DeployerUtils.wait(1);

    console.log('tx sent', tr.hash);

    let receipt;
    while (true) {
      receipt = await ethers.provider.getTransactionReceipt(tr.hash);
      if (!!receipt) {
        break;
      }
      console.log('not yet complete', tr.hash);
      await DeployerUtils.delay(10000);
    }
    console.log('transaction result', tr.hash, receipt?.status);
    if (receipt?.status !== 1 && stopOnError) {
      throw Error("Wrong status!");
    }
  }

}
