import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {SmartVault, StrategyAaveMaiBal} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {infos} from "../../../../scripts/deploy/strategies/multi/MultiAMBInfos";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {AMBPipeDeployer} from "../../../../scripts/deploy/strategies/multi/AMBPipeDeployer";
import {network} from "hardhat";
import {TokenUtils} from "../../../TokenUtils";
import {VaultUtils} from "../../../VaultUtils";
import {BigNumber} from "ethers";

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
      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyGov = strategyAaveMaiBal.connect(deployInfo.signer as SignerWithAddress);

      console.log('infos', infos);
      const info = infos.filter(i => i.underlying === underlying.toLowerCase())[0];
      console.log('info', info);
      expect(info).to.be.an('object', 'Unknown underlying');

      // ----- Deploy new pipes
      const pipes: string[] = [];
      // -----------------
      const aaveAmPipeData = await AMBPipeDeployer.deployAaveAmPipe(
          signer,
          underlying,
          info.amToken
      );
      pipes.push(aaveAmPipeData.address);
      // -----------------
      const maiCamPipeData = await AMBPipeDeployer.deployMaiCamPipe(
          signer,
          info.amToken,
          info.camToken
      );
      pipes.push(maiCamPipeData.address);
      // -----------------
      const maiStablecoinPipeData = await AMBPipeDeployer.deployMaiStablecoinPipe(
          signer,
          info.camToken,
          info.stablecoin,
          info.targetPercentage,
          info.collateralNumerator || '1'
      );
      pipes.push(maiStablecoinPipeData.address);
      // -----------------
      const balVaultPipeData = await AMBPipeDeployer.deployBalVaultPipe(
          signer
      );
      pipes.push(balVaultPipeData.address);
      // -----------------
      console.log('new pipes', pipes);

      // --------- deposit
      const maxDeposit = await strategyAaveMaiBal.maxDeposit();
      console.log('maxDeposit', maxDeposit.toString());

      expect(maxDeposit).gt(0, 'maxDeposit is 0');

      const depositAmount = maxDeposit.div(2);
      await TokenUtils.getToken(underlying, user.address, depositAmount)
      await VaultUtils.deposit(user, vault, BigNumber.from(depositAmount))
      console.log('>>>deposited');

      // test pipes replacement

      for (let i = pipes.length - 1; i >= 0; i--) {
        const totalAmountOutBefore = await strategyGov.totalAmountOut();

        await strategyGov.announcePipeReplacement(i, pipes[i]);
        const timeLockSec = 48 * 60 * 60;
        console.log('timeLockSec', timeLockSec);
        await network.provider.send("evm_increaseTime", [timeLockSec+1])
        await network.provider.send("evm_mine")
        await strategyGov.replacePipe(i, pipes[i], 10);

        const totalAmountOutAfter = await strategyGov.totalAmountOut();
        const totalAmountOutChangePercents = (totalAmountOutAfter.mul(100_000).div(totalAmountOutBefore).toNumber()/1000).toFixed(3);
        console.log(i, 'ReplacePipe totalAmountOutChangePercents', totalAmountOutChangePercents);
      }

    });
  }

}
