import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {StrategyMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";

const {expect} = chai;
chai.use(chaiAsPromised);

export class CoverageCallsTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Coverage calls", async () => {
      const strategyMaiBal = deployInfo.strategy as StrategyMaiBal;
      const strategyGov = strategyMaiBal.connect(deployInfo.signer as SignerWithAddress);

      console.log('>>>Coverage calls test');
      const platformId = await strategyMaiBal.platform();
      console.log('>>>platformId', platformId);

      const assets = await strategyMaiBal.assets();
      console.log('>>>assets', assets);

      const poolTotalAmount = await strategyMaiBal.poolTotalAmount()
      console.log('>>>poolTotalAmount', poolTotalAmount);

      const readyToClaim = await strategyMaiBal.readyToClaim()
      console.log('>>>readyToClaim', readyToClaim);

      const availableMai = await strategyMaiBal.availableMai();
      console.log('>>>availableMai', availableMai);

      expect(platformId).is.eq(33);

      const liquidationPrice = await strategyMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice', liquidationPrice.toString());

      // maxImbalance
      const maxImbalance0 = await strategyMaiBal.maxImbalance()
      const targetMaxImbalance1 = maxImbalance0.add(1)
      await expect(strategyGov.setMaxImbalance(targetMaxImbalance1))
        .to.emit(strategyGov, 'SetMaxImbalance')
        .withArgs(targetMaxImbalance1)
      const maxImbalance1 = await strategyMaiBal.maxImbalance()
      await strategyGov.setMaxImbalance(maxImbalance0)
      const maxImbalance2 = await strategyMaiBal.maxImbalance()

      // default value should be 100
      expect(maxImbalance0).is.eq(100);
      expect(maxImbalance1).is.eq(101);
      expect(maxImbalance2).is.eq(100);

    });
  }

}
