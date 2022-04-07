import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SmartVault, StrategyAaveMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {infos} from "../../../../scripts/deploy/strategies/multi/MultiAMBInfos";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {MultiPipeDeployer} from "../../../../scripts/deploy/strategies/multi/MultiPipeDeployer";
import {network} from "hardhat";
import {TokenUtils} from "../../../TokenUtils";
import {VaultUtils} from "../../../VaultUtils";
import {BigNumber} from "ethers";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

export class ReplacePipeTest extends SpecificStrategyTest {

  public async do(
      deployInfo: DeployInfo
  ): Promise<void> {
    it("Replace pipe", async () => {
      const underlying = deployInfo?.underlying as string;
      const signer = deployInfo?.signer as SignerWithAddress;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const core = deployInfo?.core as CoreContractsWrapper;
      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyGov = strategyAaveMaiBal.connect(deployInfo.signer as SignerWithAddress);

      const info = infos.filter(i => i.underlying === underlying.toLowerCase())[0];
      console.log('info', info);
      expect(info).to.be.an('object', 'Unknown underlying');

      // ----- Deploy new pipes
      const newPipes: string[] = [];
      const strategyDeployer = MultiPipeDeployer.MBStrategyDeployer(
          'StrategyMaiBal', core, signer, underlying, info, newPipes, false);
      await strategyDeployer(vault.address);
      console.log('new pipes', newPipes);

      // --------- deposit
      const maxDeposit = await strategyAaveMaiBal.maxDeposit();
      console.log('maxDeposit', maxDeposit.toString());

      expect(maxDeposit).gt(0, 'maxDeposit is 0');

      const depositAmount = maxDeposit.div(2);
      await TokenUtils.getToken(underlying, user.address, depositAmount)
      await VaultUtils.deposit(user, vault, BigNumber.from(depositAmount))
      console.log('>>>deposited');

      // test pipes replacement

      for (let i = newPipes.length - 1; i >= 0; i--) {
        const totalAmountOutBefore = await strategyGov.totalAmountOut();

        await expect(
            strategyGov.announcePipeReplacement(0, MaticAddresses.ZERO_ADDRESS)
        ).to.be.revertedWith('AMB: newPipe is 0');

        await strategyGov.announcePipeReplacement(i, newPipes[i]);

        await expect(
            strategyGov.announcePipeReplacement(i, newPipes[i])
        ).to.be.revertedWith('AMB: Already defined');

        await expect(
            strategyGov.replacePipe(i, newPipes[i], 10)
        ).to.be.revertedWith('AMB: Too early');

        const timeLockSec = 48 * 60 * 60;
        console.log('timeLockSec', timeLockSec);
        await network.provider.send("evm_increaseTime", [timeLockSec+1])
        await network.provider.send("evm_mine")

        await expect(
            strategyGov.replacePipe(i, MaticAddresses.ZERO_ADDRESS, 10)
        ).to.be.revertedWith('AMB: Wrong address');

        await expect(
            strategyGov.replacePipe(i, newPipes[i], 0)
        ).to.be.revertedWith('LP: Loss more than maxDecrease');

        await strategyGov.replacePipe(i, newPipes[i], 10);

        const totalAmountOutAfter = await strategyGov.totalAmountOut();
        const totalAmountOutChangePercents = (totalAmountOutAfter.mul(100_000).div(totalAmountOutBefore).toNumber()/1000 - 100).toFixed(3);
        console.log(i, 'ReplacePipe totalAmountOutChangePercents', totalAmountOutChangePercents);
      }

    });
  }

}
