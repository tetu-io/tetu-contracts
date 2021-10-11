import {expect} from "chai";
import {ethers} from "hardhat";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";

export class TimeUtils {

  public static async advanceBlocksOnTs(add: number) {
    console.log('Block advanced on', add);
    // const block = await TimeUtils.currentBlock();
    await ethers.provider.send('evm_increaseTime', [add]);
    await ethers.provider.send('evm_mine', []);
    // await TimeUtils.mineAndCheck();
  }

  public static async advanceNBlocks(n: number) {
    await ethers.provider.send('evm_increaseTime', [n * 3]);
    for (let i = 0; i < n; i++) {
      await ethers.provider.send('evm_mine', []);
    }
  }

  public static async mineAndCheck() {
    const start = ethers.provider.blockNumber;
    while (true) {
      await ethers.provider.send('evm_mine', []);
      if (ethers.provider.blockNumber > start) {
        break;
      }
      console.log('waite mine 10sec');
      await DeployerUtils.delay(10000);
    }
  }

  public static async setBlock(blockNumber: number) {
    await ethers.provider.send('evm_setNextBlockTimestamp', [blockNumber]);
  }

  // doesn't work, need to investigate
  public static async currentBlock() {
    let count = 0;
    while (true) {
      count++;
      const blockNumber = await ethers.provider.getBlockNumber();
      try {
        expect(blockNumber).is.greaterThan(0);
        const block = await ethers.provider.getBlock(blockNumber);
        expect(block.timestamp > 0).is.eq(true);
        if (!!block) {
          return block;
        }
      } catch (e) {
        console.log('wrong last block!', blockNumber, e);
      }
      console.log('wrong last block!', blockNumber);
      await TimeUtils.advanceBlocksOnTs(1);
      expect(count < 100000).is.eq(true);
    }
  }

  public static async getBlockTime(): Promise<number> {
    return (await ethers.provider.getBlock(await ethers.provider._getFastBlockNumber())).timestamp
  }

  public static async snapshot() {
    const id = await ethers.provider.send("evm_snapshot", []);
    console.log("made snapshot", id);
    return id;
  }

  public static async rollback(id: string) {
    console.log("restore snapshot", id);
    return ethers.provider.send("evm_revert", [id]);
  }

}
