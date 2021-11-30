import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyAaveMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {UniswapUtils} from "../../../UniswapUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class PumpInOnHardWorkTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("PumpIn on hardwork", async () => {
      const signer = deployInfo?.signer as SignerWithAddress;
      const underlying = deployInfo?.underlying as string;

      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      console.log('>>>PumpIn on hardwork');
      const strategyGov = strategyAaveMaiBal.connect(signer);
      const amount = utils.parseUnits('10')
      await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, amount);
      await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, underlying, amount);
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
