import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {BigNumber} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {IStrategy, SmartVault} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {VaultUtils} from "../../../VaultUtils";
import {AMBUtils} from "./AMBUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class WithdrawAndClaimTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Withdraw and Claim from Pool", async () => {
      const underlying = deployInfo?.underlying as string;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const strategy = deployInfo?.strategy as IStrategy;
      await AMBUtils.refuelMAI(user, strategy.address);

      console.log('>>>withdrawAndClaimFromPool test');
      const userAddress = user.address
      const before = await TokenUtils.balanceOf(underlying, userAddress)
      console.log('>>>before      ', before.toString());

      await VaultUtils.deposit(user, vault, BigNumber.from(before));

      const afterDeposit = await TokenUtils.balanceOf(underlying, userAddress)
      console.log('>>>afterDeposit', afterDeposit.toString());

      await vault.connect(user).exit();

      const afterExit = await TokenUtils.balanceOf(underlying, userAddress)
      console.log('>>>afterExit   ', afterExit.toString());

      expect(afterDeposit).to.be.equal(0)
      // expect(afterExit).to.be.closeTo(before, before.div(200));
    });

  }

}
