import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {IStrategy, StrategyMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {MBUtils} from "./MBUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class PumpInOnHardWorkTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("PumpIn on hardwork", async () => {
      const signer = deployInfo?.signer as SignerWithAddress;
      const underlying = deployInfo?.underlying as string;
      const strategy = deployInfo?.strategy as IStrategy;
      await MBUtils.refuelMAI(signer, strategy.address);

      const strategyMaiBal = deployInfo.strategy as StrategyMaiBal;
      console.log('>>>PumpIn on hardwork');
      const strategyGov = strategyMaiBal.connect(signer);
      const amount = utils.parseUnits('10')
      await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, signer.address, amount);
      if (underlying.toLowerCase() === MaticAddresses.WBTC_TOKEN) {
        // send 0.1 WBTC (as WBTC have 8 decimals and 'amount' too big)
        await TokenUtils.getToken(underlying, signer.address, BigNumber.from(10000000))
      } else {
        await TokenUtils.getToken(underlying, signer.address, amount)
      }
      const bal = await TokenUtils.balanceOf(underlying, signer.address)
      console.log('>>>bal   ', bal);
      await TokenUtils.transfer(underlying, signer, strategyGov.address, bal.toString());
      const before = await TokenUtils.balanceOf(underlying, strategyGov.address)
      console.log('>>>before', before.toString());
      await strategyGov.doHardWork();
      const after = await TokenUtils.balanceOf(underlying, strategyGov.address)
      console.log('>>>after ', after.toString());

      expect(before).to.be.equal(bal)
      expect(after).to.be.equal(0, 'Underlying token should be pumped in on hard work')
    });

  }

}
