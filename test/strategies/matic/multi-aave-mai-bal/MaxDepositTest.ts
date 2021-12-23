import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {IStrategy, SmartVault, StrategyAaveMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {VaultUtils} from "../../../VaultUtils";
import {TestAsserts} from "../../../TestAsserts";
import {AMBUtils} from "./AMBUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class MaxDepositTest extends SpecificStrategyTest {

  public async do(
      deployInfo: DeployInfo
  ): Promise<void> {
    it("Max Deposit Test", async () => {
      const ADD_AMOUNT = '10000'

      const signer = deployInfo?.signer as SignerWithAddress;
      const underlying = deployInfo?.underlying as string;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const strategy = deployInfo?.strategy as IStrategy;

      const bal = await TokenUtils.balanceOf(underlying, user.address);

      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyGov = strategyAaveMaiBal.connect(signer);

      const maxDeposit = await strategyAaveMaiBal.maxDeposit();
      console.log('maxDeposit', maxDeposit.toString());

      if (maxDeposit.eq(0)) return;

      const maxDeposit99 = maxDeposit.mul(99).div(100);
      const maxDeposit101 = maxDeposit.mul(101).div(100);
      await TokenUtils.getToken(underlying, user.address, maxDeposit101)

      await expect(VaultUtils.deposit(user, vault, BigNumber.from(maxDeposit101))).to.be.reverted;
      console.log('>>>reverted 101% of maxDeposit');


      await VaultUtils.deposit(user, vault, BigNumber.from(maxDeposit99))
      console.log('>>>deposited 99% of maxDeposit');



    });

  }

}
