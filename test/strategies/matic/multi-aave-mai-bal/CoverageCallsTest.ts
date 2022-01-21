import { SpecificStrategyTest } from "../../SpecificStrategyTest";
import { SmartVault, StrategyAaveMaiBal } from "../../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { DeployInfo } from "../../DeployInfo";

const { expect } = chai;
chai.use(chaiAsPromised);

export class CoverageCallsTest extends SpecificStrategyTest {
  public async do(deployInfo: DeployInfo): Promise<void> {
    it("Coverage calls", async () => {
      const underlying = deployInfo?.underlying as string;
      const signer = deployInfo?.signer as SignerWithAddress;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyGov = strategyAaveMaiBal.connect(
        deployInfo.signer as SignerWithAddress
      );
      const UNWRAPPING_PIPE_INDEX = 0;
      const AAVE_PIPE_INDEX = 1;

      console.log(">>>Coverage calls test");
      const platformId = await strategyAaveMaiBal.platform();
      console.log(">>>platformId", platformId);

      const assets = await strategyAaveMaiBal.assets();
      console.log(">>>assets", assets);

      const poolTotalAmount = await strategyAaveMaiBal.poolTotalAmount();
      console.log(">>>poolTotalAmount", poolTotalAmount);

      const readyToClaim = await strategyAaveMaiBal.readyToClaim();
      console.log(">>>readyToClaim", readyToClaim);

      const availableMai = await strategyAaveMaiBal.availableMai();
      console.log(">>>availableMai", availableMai);

      expect(platformId).is.eq(15);

      const liquidationPrice = await strategyAaveMaiBal.liquidationPrice();
      console.log(">>>liquidationPrice", liquidationPrice.toString());

      // maxImbalance
      const maxImbalance0 = await strategyAaveMaiBal.maxImbalance();
      const targetMaxImbalance1 = maxImbalance0.add(1);
      await expect(strategyGov.setMaxImbalance(targetMaxImbalance1))
        .to.emit(strategyGov, "SetMaxImbalance")
        .withArgs(targetMaxImbalance1);
      const maxImbalance1 = await strategyAaveMaiBal.maxImbalance();
      await strategyGov.setMaxImbalance(maxImbalance0);
      const maxImbalance2 = await strategyAaveMaiBal.maxImbalance();

      // default value should be 100
      expect(maxImbalance0).is.eq(100);
      expect(maxImbalance1).is.eq(101);
      expect(maxImbalance2).is.eq(100);
    });
  }
}
