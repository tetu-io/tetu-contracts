import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {TokenUtils} from "../../../TokenUtils";
import {IStrategy, SmartVault, StrategyMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {VaultUtils} from "../../../VaultUtils";
import {MBUtils} from "./MBUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class EmergencyWithdrawFromPoolTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Emergency withdraw from Pool", async () => {
      const underlying = deployInfo?.underlying as string;
      const signer = deployInfo?.signer as SignerWithAddress;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const strategyMaiBal = deployInfo.strategy as StrategyMaiBal;
      const strategy = deployInfo?.strategy as IStrategy;
      await MBUtils.refuelMAI(user, strategy.address);

      console.log('>>>emergencyWithdrawFromPool test');
      const userAddress = user.address
      const _depositAmount = await TokenUtils.balanceOf(underlying, userAddress);
      const before = await strategyMaiBal.getMostUnderlyingBalance()
      console.log('>>>before      ', before.toString());

      await VaultUtils.deposit(user, vault, _depositAmount);

      const afterDeposit = await strategyMaiBal.getMostUnderlyingBalance()
      console.log('>>>afterDeposit', afterDeposit.toString());

      const strategyGov = strategyMaiBal.connect(signer);
      await strategyGov.emergencyExit({gasLimit: 19_000_000});

      const afterExit = await strategyMaiBal.getMostUnderlyingBalance()
      console.log('>>>afterExit   ', afterExit.toString());

      expect(before).to.be.equal(0)
      expect(afterDeposit).to.be.above(before);
      expect(afterExit).to.be.equal(0)
    });

  }

}
