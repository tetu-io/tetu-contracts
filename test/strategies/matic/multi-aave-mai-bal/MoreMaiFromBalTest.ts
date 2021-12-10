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

export class MoreMaiFromBalTest extends SpecificStrategyTest {

  public async do(
      deployInfo: DeployInfo
  ): Promise<void> {
    it("More Mai from Balancer", async () => {
      const ADD_AMOUNT = '10000'

      const signer = deployInfo?.signer as SignerWithAddress;
      const underlying = deployInfo?.underlying as string;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const strategy = deployInfo?.strategy as IStrategy;
      await AMBUtils.refuelMAI(user, strategy.address);

      const bal = await TokenUtils.balanceOf(underlying, user.address);

      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyGov = strategyAaveMaiBal.connect(signer);

      const pipesLength = await strategyGov.pipesLength();
      console.log('>>>pipesLength  ', pipesLength.toString());
      const balPipe = await strategyGov.pipes(pipesLength.sub(1)); // bal should be last pipe
      console.log('>>>balPipe      ', balPipe);
      const maiPipe = await strategyGov.pipes(pipesLength.sub(2)); // mai should be before last pipe
      console.log('>>>maiPipe      ', maiPipe);

      const targetPercentageInitial = await strategyGov.targetPercentage()
      console.log('>>>targetPercentageInitial', targetPercentageInitial.toString());
      await VaultUtils.deposit(user, vault, BigNumber.from(bal));
      console.log('>>>deposited');
      const bal1 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal1', bal1.toString());

      const addAmount = utils.parseUnits(ADD_AMOUNT)
      const token = MaticAddresses.miMATIC_TOKEN;
      await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, signer.address, addAmount);
      await TokenUtils.getToken(token, balPipe, addAmount);
      const bal2 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal2', bal2.toString(), '(after addition)');

      const miBalanceOnBal1 = await TokenUtils.balanceOf(token, balPipe)
      console.log('>>>miBalanceOnBal1', miBalanceOnBal1.toString());
      const miBalanceOnMai1 = await TokenUtils.balanceOf(token, maiPipe)
      console.log('>>>miBalanceOnMai1', miBalanceOnMai1.toString());

      // increase collateral to debt percentage twice, so debt should be decreased twice
      // and additional tokens pumped out
      await strategyGov.setTargetPercentage(targetPercentageInitial.mul(2))
      const targetPercentage2 = await strategyGov.targetPercentage()
      console.log('>>>targetPercentage2', targetPercentage2.toString())
      const miBalanceOnBal2 = await TokenUtils.balanceOf(token, balPipe)
      console.log('>>>miBalanceOnBal2', miBalanceOnBal2.toString());
      const miBalanceOnMai2 = await TokenUtils.balanceOf(token, maiPipe)
      console.log('>>>miBalanceOnMai2', miBalanceOnMai2.toString());
      const bal3 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal3           ', bal3.toString());

      // return target percentage back, so debt should be increased twice
      // and additional mai amount deposited to balancer
      await strategyGov.setTargetPercentage(targetPercentageInitial)
      const targetPercentage3 = await strategyGov.targetPercentage()
      console.log('>>>targetPercentage3', targetPercentage3.toString())

      const miBalanceOnBal3 = await TokenUtils.balanceOf(token, balPipe)
      console.log('>>>miBalanceOnBal3', miBalanceOnBal3.toString());
      const miBalanceOnMai3 = await TokenUtils.balanceOf(token, maiPipe)
      console.log('>>>miBalanceOnMai3', miBalanceOnMai3.toString());
      const bal4 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal4           ', bal4.toString());

      const dec = await TokenUtils.decimals(underlying);

      expect(miBalanceOnBal3.toNumber()).to.equal(0) // should all deposited
      expect(miBalanceOnMai3.toNumber()).to.equal(0) // should all deposited
      TestAsserts.closeTo(bal4, bal1.add(addAmount), 0.005, dec);

    });

  }

}
