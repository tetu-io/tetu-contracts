import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {
  SmartVault,
  StrategyAaveMaiBal,
  TetuProxyControlled,
  Controller,
  Announcer,
  IControllableExtended,
} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {infos} from "../../../../scripts/deploy/strategies/multi/MultiMBInfos";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {network} from "hardhat";
import {TokenUtils} from "../../../TokenUtils";
import {VaultUtils} from "../../../VaultUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {BigNumber} from "ethers";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";

const {expect} = chai;
chai.use(chaiAsPromised);

export class UpdatePipeProxyTest extends SpecificStrategyTest {

  public async do(
      deployInfo: DeployInfo
  ): Promise<void> {
    it("Update pipe proxy", async () => {
      const underlying = deployInfo?.underlying as string;
      const signer = deployInfo?.signer as SignerWithAddress;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;
      const core = deployInfo?.core as CoreContractsWrapper;

      const controller = await DeployerUtils.connectInterface(signer, 'Controller', core.controller.address) as Controller;
      const announcer = await DeployerUtils.connectInterface(signer, 'Announcer', core.announcer.address) as Announcer;

      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;
      const strategyUser = strategyAaveMaiBal.connect(deployInfo.user as SignerWithAddress);
      const strategyGov = strategyAaveMaiBal.connect(deployInfo.signer as SignerWithAddress);
      const strategyUserProxy = await DeployerUtils.connectInterface(deployInfo.user as SignerWithAddress, 'TetuProxyControlled', strategyAaveMaiBal.address) as TetuProxyControlled;
      const strategyGovProxy = await DeployerUtils.connectInterface(deployInfo.signer as SignerWithAddress, 'TetuProxyControlled', strategyAaveMaiBal.address) as TetuProxyControlled;

      const info = infos.filter(i => i.underlying === underlying.toLowerCase())[0];
      console.log('info', info);
      expect(info).to.be.an('object', 'Unknown underlying');

      // ----- Deploy new Pipes
      const maiStablecoinPipe = await DeployerUtils.deployContract(signer, 'MaiStablecoinPipe');
      const balVaultPipe = await DeployerUtils.deployContract(signer, 'BalVaultPipe');
      const newPipeImpl: string[] = [
        maiStablecoinPipe.address,
        balVaultPipe.address
      ];
      console.log('newPipeImpl', newPipeImpl);

      // --------- deposit
      const maxDeposit = await strategyAaveMaiBal.maxDeposit();
      console.log('maxDeposit', maxDeposit.toString());
      expect(maxDeposit).gt(0, 'maxDeposit is 0');
      const depositAmount = maxDeposit.div(200);
      await TokenUtils.getToken(underlying, user.address, depositAmount)
      await VaultUtils.deposit(user, vault, BigNumber.from(depositAmount))
      console.log('>>>deposited');

      // test newPipeImpl proxy upgrade

      for (let i = newPipeImpl.length - 1; i >= 0; i--) {
        const totalAmountOutBefore = await strategyGov.totalAmountOut();
        const pipeAddress = await strategyUser.pipes(i);
        const pipeProxyControlled = await DeployerUtils.connectInterface(
            user, 'TetuProxyControlled', pipeAddress) as TetuProxyControlled;
        const oldImplAddress = await pipeProxyControlled.implementation();
        console.log('oldImplAddress', oldImplAddress);
        const newPipeImplAddress = newPipeImpl[i];
        console.log('newPipeImplAddress', newPipeImplAddress);

        await expect(
            strategyUserProxy.upgrade(newPipeImplAddress)
        ).to.be.revertedWith('forbidden');

        // const balPipeSigner = await DeployerUtils.connectInterface(signer, 'Pipe', balPipeAddress) as Pipe;
        const pipeControllableUser = await DeployerUtils.connectInterface(user, 'IControllableExtended', pipeAddress) as IControllableExtended;
        const pipeController = await pipeControllableUser.controller();
        console.log('pipeController', pipeController);

        console.log('announceTetuProxyUpgrade');
        await announcer.announceTetuProxyUpgrade(pipeAddress, newPipeImplAddress);
        const timeLockSec = (await announcer.timeLock()).toNumber();
        console.log('timeLockSec', timeLockSec);
        await network.provider.send("evm_increaseTime", [timeLockSec+1])
        await network.provider.send("evm_mine")

        console.log('upgradeTetuProxyBatch');
        await controller.upgradeTetuProxyBatch([pipeAddress], [newPipeImplAddress]);

        const newImplAddress = await pipeProxyControlled.implementation();
        console.log('newImplAddress', newImplAddress);
        expect(oldImplAddress).is.not.eq(newImplAddress);
        expect(newImplAddress).is.eq(newPipeImplAddress);

        const totalAmountOutAfter = await strategyGov.totalAmountOut();
        console.log('totalAmountOutAfter', totalAmountOutAfter);
        const totalAmountOutChangePercents = (totalAmountOutAfter.mul(100_000).div(totalAmountOutBefore).toNumber()/1000 - 100).toFixed(3);
        console.log(i, 'Upgrade Pipe Proxy totalAmountOutChangePercents', totalAmountOutChangePercents);
      }

    });
  }

}
