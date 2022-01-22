import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {
  Announcer,
  Controller,
  IStrategy__factory,
  SmartVault,
  StrategySplitter__factory
} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {TimeUtils} from "../../../TimeUtils";
import {Misc} from "../../../../scripts/utils/tools/Misc";
import {VaultUtils} from "../../../VaultUtils";
import {TokenUtils} from "../../../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class SplitterSpecificTests extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {

    it("SplitterSpecificTest: Add/Remove strategies", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const announcer = deployInfo.core?.announcer as Announcer;
      const controller = deployInfo.core?.controller as Controller;
      const splitter = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);
      expect(await splitter.strategiesLength()).is.eq(3)

      const stratForRemove = await splitter.strategies(0);
      const stratForKeep = await splitter.strategies(1);
      const lastStrategy = await splitter.strategies(2);

      expect(await splitter.strategiesRatios(stratForRemove)).is.not.eq(0);
      expect(await splitter.strategiesRatios(stratForKeep)).is.not.eq(0);

      await expect(splitter.removeStrategy(Misc.ZERO_ADDRESS)).is.rejectedWith("ArrayLib: Item not found");
      await splitter.removeStrategy(stratForRemove);
      expect(await splitter.strategiesLength()).is.eq(2)
      expect(await splitter.strategies(0)).is.eq(stratForKeep);
      expect(await splitter.strategiesRatios(stratForRemove)).is.eq(0);
      expect(await splitter.strategiesRatios(stratForKeep)).is.not.eq(0);

      const removedStrategy = IStrategy__factory.connect(stratForRemove, signer);
      expect(await removedStrategy.investedUnderlyingBalance()).is.eq(0);
      await splitter.removeStrategy(stratForKeep);
      await expect(splitter.removeStrategy(lastStrategy)).is.rejectedWith("SS: Can't remove last strategy");

      await announcer.announceStrategyUpgrades([splitter.address], [stratForRemove]);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 50)
      await controller.addStrategiesToSplitter(splitter.address, [stratForRemove]);

      expect(await splitter.strategiesLength()).is.eq(2)
      expect(await splitter.strategies(1)).is.eq(stratForRemove);
      expect(await splitter.strategiesRatios(stratForRemove)).is.eq(0);
      expect(await splitter.strategiesRatios(lastStrategy)).is.eq(100);

      await announcer.announceStrategyUpgrades([splitter.address], [stratForRemove]);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 50)
      await expect(controller.addStrategiesToSplitter(splitter.address, [stratForRemove])).is.rejectedWith("ArrayLib: Not unique item");
    });

    it("SplitterSpecificTest: Request withdraw", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const splitter = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);
      const vault = deployInfo.vault as SmartVault;
      const underlying = deployInfo.underlying as string;

      const balance = await TokenUtils.balanceOf(underlying, signer.address)

      await VaultUtils.deposit(signer, vault, balance);
      expect(await splitter.needRebalance()).is.eq(1);
      await splitter.rebalanceAll();

      expect(await splitter.investedUnderlyingBalance()).is.not.eq(0);
      expect(await splitter.poolTotalAmount()).is.not.eq(0);
      expect(await splitter.maxCheapWithdraw()).is.not.eq(0);

      await splitter.requestWithdraw(balance);

      expect((await splitter.wantToWithdraw()).toString()).is.eq(balance.toString());
      await splitter.processWithdrawRequests();
      expect((await splitter.wantToWithdraw()).toString()).is.not.eq('0');
      await splitter.processWithdrawRequests();
      expect((await splitter.wantToWithdraw()).toString()).is.not.eq('0');
      await splitter.processWithdrawRequests();
      expect((await splitter.wantToWithdraw()).toString()).is.eq('0');
      expect((await splitter.underlyingBalance()).toString()).is.eq(balance.toString());
    });

    it("SplitterSpecificTest: Common functions", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const splitter = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);

      await splitter.setNeedRebalance(1)
      expect(await splitter.needRebalance()).is.eq(1);
      await splitter.setNeedRebalance(0)
      expect(await splitter.needRebalance()).is.eq(0);
      await expect(splitter.setNeedRebalance(2)).is.rejectedWith("SS: Wrong value");

      const rts = await splitter.strategyRewardTokens();
      console.log('rts', rts);
      expect(rts.length).is.eq(2);

      expect(await splitter.buyBackRatio()).is.eq(10000);
      expect(await splitter.platform()).is.eq(24);
      expect(await splitter.strategiesLength()).is.eq(3);
      expect((await splitter.allStrategies()).length).is.eq(3);
    });

    // *********** SUB SPLITTER ******************

    it("SplitterSpecificTest: Sub: Add/Remove strategies", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const announcer = deployInfo.core?.announcer as Announcer;
      const controller = deployInfo.core?.controller as Controller;
      const splitterParent = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);
      const splitterAdr = await splitterParent.strategies(0);
      const splitter = StrategySplitter__factory.connect(splitterAdr, signer);
      expect(await splitter.strategiesLength()).is.eq(2)

      const stratForRemove = await splitter.strategies(0);
      const stratForKeep = await splitter.strategies(1);

      expect(await splitter.strategiesRatios(stratForRemove)).is.not.eq(0);
      expect(await splitter.strategiesRatios(stratForKeep)).is.not.eq(0);

      await expect(splitter.removeStrategy(Misc.ZERO_ADDRESS)).is.rejectedWith("ArrayLib: Item not found");
      await splitter.removeStrategy(stratForRemove);
      expect(await splitter.strategiesLength()).is.eq(1)
      expect(await splitter.strategies(0)).is.eq(stratForKeep);
      expect(await splitter.strategiesRatios(stratForRemove)).is.eq(0);
      expect(await splitter.strategiesRatios(stratForKeep)).is.not.eq(0);

      const removedStrategy = IStrategy__factory.connect(stratForRemove, signer);
      expect(await removedStrategy.investedUnderlyingBalance()).is.eq(0);
      await expect(splitter.removeStrategy(stratForKeep)).is.rejectedWith("SS: Can't remove last strategy");

      await announcer.announceStrategyUpgrades([splitter.address], [stratForRemove]);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 50)
      await controller.addStrategiesToSplitter(splitter.address, [stratForRemove]);

      expect(await splitter.strategiesLength()).is.eq(2)
      expect(await splitter.strategies(1)).is.eq(stratForRemove);
      expect(await splitter.strategiesRatios(stratForRemove)).is.eq(0);
      expect(await splitter.strategiesRatios(stratForKeep)).is.eq(100);

      await announcer.announceStrategyUpgrades([splitter.address], [stratForRemove]);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 50)
      await expect(controller.addStrategiesToSplitter(splitter.address, [stratForRemove])).is.rejectedWith("ArrayLib: Not unique item");
    });

    it("SplitterSpecificTest: Sub: Request withdraw", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const splitterParent = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);
      const splitterAdr = await splitterParent.strategies(0);
      const splitter = StrategySplitter__factory.connect(splitterAdr, signer);
      const vault = deployInfo.vault as SmartVault;
      const underlying = deployInfo.underlying as string;

      const balance = (await TokenUtils.balanceOf(underlying, signer.address))

      await VaultUtils.deposit(signer, vault, balance);
      expect(await splitterParent.needRebalance()).is.eq(1);
      await splitterParent.rebalanceAll();
      expect(await splitter.needRebalance()).is.eq(1);
      await splitter.rebalanceAll();

      expect(await splitter.investedUnderlyingBalance()).is.not.eq(0);
      expect(await splitter.poolTotalAmount()).is.not.eq(0);
      expect(await splitter.maxCheapWithdraw()).is.not.eq(0);

      await splitter.requestWithdraw(balance.div(100));

      expect((await splitter.wantToWithdraw()).toString()).is.eq(balance.div(100).toString());
      await splitter.processWithdrawRequests();
      expect((await splitter.wantToWithdraw()).toString()).is.eq('0');
      // expect((await splitter.underlyingBalance()).toString()).is.eq(balance.toString());
    });

    it("SplitterSpecificTest: Sub: Common functions", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const splitterParent = StrategySplitter__factory.connect(deployInfo.strategy?.address as string, signer);
      const splitterAdr = await splitterParent.strategies(0);
      const splitter = StrategySplitter__factory.connect(splitterAdr, signer);

      await splitter.setNeedRebalance(1)
      expect(await splitter.needRebalance()).is.eq(1);
      await splitter.setNeedRebalance(0)
      expect(await splitter.needRebalance()).is.eq(0);
      await expect(splitter.setNeedRebalance(2)).is.rejectedWith("SS: Wrong value");

      const rts = await splitter.strategyRewardTokens();
      console.log('rts', rts);
      expect(rts.length).is.eq(2);

      expect(await splitter.buyBackRatio()).is.eq(10000);
      expect(await splitter.platform()).is.eq(24);
      expect(await splitter.strategiesLength()).is.eq(2);
      expect((await splitter.allStrategies()).length).is.eq(2);
    });

  }

}
