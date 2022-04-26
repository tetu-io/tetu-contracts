import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

export class SalvageFromPipelineTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Salvage from pipeline", async () => {
      const signer = deployInfo?.signer as SignerWithAddress;

      const strategyMaiBal = deployInfo.strategy as StrategyMaiBal;

      console.log('>>>Salvage from pipeline test');
      const strategyGov = strategyMaiBal.connect(signer);
      const token = MaticAddresses.DAI_TOKEN; // token to test salvage, 18 decimals
      const pipesLength = await strategyGov.pipesLength();
      console.log('>>>pipesLength  ', pipesLength.toString());
      const amountPerPipe = utils.parseUnits('1')
      console.log('>>>amountPerPipe', amountPerPipe.toString());
      const totalAmount = amountPerPipe.mul(pipesLength)
      console.log('>>>totalAmount  ', totalAmount.toString());
      await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, signer.address, totalAmount);
      await TokenUtils.getToken(token, signer.address, totalAmount);

      const balanceAfterBuy = await TokenUtils.balanceOf(token, signer.address)
      console.log('>>>balanceAfterBuy', balanceAfterBuy.toString());

      for (let i = 0; i < pipesLength.toNumber(); i++) {
        const pipe = await strategyGov.pipes(i);
        await TokenUtils.transfer(token, signer, pipe, amountPerPipe.toString());
      }

      const balanceBefore = await TokenUtils.balanceOf(token, signer.address)
      console.log('>>>balanceBefore', balanceBefore);

      await expect(strategyGov.salvageFromPipeline(signer.address, token))
        .to.emit(strategyGov, 'SalvagedFromPipeline')
        .withArgs(signer.address, utils.getAddress(token))

      const balanceAfter = await TokenUtils.balanceOf(token, signer.address)
      console.log('>>>balanceAfter ', balanceAfter);

      const increase = balanceAfter.sub(balanceBefore)
      console.log('>>>increase     ', increase);

      expect(increase).to.be.equal(totalAmount);
    });
  }

}
