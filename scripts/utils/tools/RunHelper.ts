import {ethers} from "hardhat";
import {BigNumber, ContractTransaction, PopulatedTransaction} from "ethers";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Logger} from "tslog";
import logSettings from "../../../log_settings";
import {Misc} from "./Misc";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {formatUnits} from "ethers/lib/utils";

const log: Logger<undefined> = new Logger(logSettings);


export class RunHelper {

  public static async runAndWait(callback: () => Promise<ContractTransaction>, stopOnError = true, wait = true) {
    const start = Date.now();
    const tr = await callback();
    log.info('tx sent', tr.hash);
    if (!wait) {
      Misc.printDuration('runAndWait completed', start);
      return;
    }
    // const r0 = await tr.wait(1);
    // log.info('tx confirmed', tr.hash, 'gas used:', r0.gasUsed.toString());

    let receipt;
    while (true) {
      receipt = await ethers.provider.getTransactionReceipt(tr.hash);
      if (!!receipt) {
        break;
      }
      log.info('not yet complete', tr.hash);
      await DeployerUtils.delay(10000);
    }
    log.info('transaction result', tr.hash, receipt?.status);
    log.info('gas used', receipt.gasUsed.toString());
    if (receipt?.status !== 1 && stopOnError) {
      throw Error("Wrong status!");
    }
    Misc.printDuration('runAndWait completed', start);
  }

  public static async runAndWait2(txPopulated: Promise<PopulatedTransaction>, stopOnError = true, wait = true) {
    console.log('prepare run and wait2')
    const tx = await txPopulated;
    const signer = (await ethers.getSigners())[0];
    const gas = (await signer.estimateGas(tx)).toNumber()

    const params = await RunHelper.txParams();
    console.log('params', params)

    tx.gasLimit = BigNumber.from(gas).mul(15).div(10);

    if (params?.maxFeePerGas) tx.maxFeePerGas = BigNumber.from(params.maxFeePerGas);
    if (params?.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = BigNumber.from(params.maxPriorityFeePerGas);
    if (params?.gasPrice) tx.gasPrice = BigNumber.from(params.gasPrice);

    return RunHelper.runAndWait(() => signer.sendTransaction(tx), stopOnError, wait);
  }

  public static async runAndWait2ExplicitSigner(signer: SignerWithAddress, txPopulated: Promise<PopulatedTransaction>, stopOnError = true, wait = true) {
    console.log('prepare run and wait2')
    const tx = await txPopulated;
    const gas = (await signer.estimateGas(tx)).toNumber()

    const params = await RunHelper.txParams();
    console.log('params', params)

    tx.gasLimit = BigNumber.from(gas).mul(15).div(10);

    if (params?.maxFeePerGas) tx.maxFeePerGas = BigNumber.from(params.maxFeePerGas);
    if (params?.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = BigNumber.from(params.maxPriorityFeePerGas);
    if (params?.gasPrice) tx.gasPrice = BigNumber.from(params.gasPrice);

    return RunHelper.runAndWait(() => signer.sendTransaction(tx), stopOnError, wait);
  }

  public static async txParams() {
    const provider = ethers.provider;
    const feeData = await provider.getFeeData();


    console.log('maxPriorityFeePerGas', formatUnits(feeData.maxPriorityFeePerGas?.toString() ?? '0', 9));
    console.log('maxFeePerGas', formatUnits(feeData.maxFeePerGas?.toString() ?? '0', 9));
    console.log('gas price:', formatUnits(feeData.gasPrice?.toString() ?? '0', 9));

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      const maxPriorityFeePerGas = Math.max(feeData.maxPriorityFeePerGas?.toNumber() ?? 1, feeData.lastBaseFeePerGas?.toNumber() ?? 1);
      const maxFeePerGas = (feeData.maxFeePerGas?.toNumber() ?? 1) * 2;
      return {
        maxPriorityFeePerGas: maxPriorityFeePerGas.toFixed(0),
        maxFeePerGas: maxFeePerGas.toFixed(0),
      };
    } else {
      return {
        gasPrice: ((feeData.gasPrice?.toNumber() ?? 1) * 1.2).toFixed(0),
      };
    }
  }
}
