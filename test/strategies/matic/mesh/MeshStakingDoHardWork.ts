import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {BigNumber, utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {Misc} from "../../../../scripts/utils/tools/Misc";
import {VaultUtils} from "../../../VaultUtils";
import {BalDepositor__factory, StrategyBalStaking__factory} from "../../../../typechain";

const {expect} = chai;
chai.use(chaiAsPromised);


export class MeshStakingDoHardWork extends DoHardWorkLoopBase {

  public async start(deposit: BigNumber, loops: number, loopValue: number, advanceBlocks: boolean) {
    const start = Date.now();
    this.loops = loops;
    console.log(`>>>>> deposit ${deposit.toString()}`);
    this.userDeposited = deposit;
    await this.init();
    await this.initialCheckVault();
    await this.enterToVault();
    await this.initialSnapshot();
    await this.loop(loops, loopValue, advanceBlocks);
    await this.postLoopCheck();
    Misc.printDuration('HardWork test finished', start);
  }

  protected async enterToVault() {
    console.log('--- Enter to vault')
    // initial deposit from signer
    await VaultUtils.deposit(this.signer, this.vault, this.userDeposited.div(2));
    this.signerDeposited = this.userDeposited.div(2);
    await VaultUtils.deposit(this.user, this.vault, this.userDeposited);

    await this.userCheckBalanceInVault();

    // remove excess tokens
    const excessBalUser = await TokenUtils.balanceOf(this.underlying, this.user.address);
    if (!excessBalUser.isZero()) {
      await TokenUtils.transfer(this.underlying, this.user, this.tools.calculator.address, excessBalUser.toString());
    }
    const excessBalSigner = await TokenUtils.balanceOf(this.underlying, this.signer.address);
    if (!excessBalSigner.isZero()) {
      await TokenUtils.transfer(this.underlying, this.signer, this.tools.calculator.address, excessBalSigner.toString());
    }
    console.log('--- Enter to vault end')
  }


  public async loopEndActions(i: number) {
    const strategyBalance = await this.strategy.investedUnderlyingBalance();
    console.log(`>>>> >>>> strategyBalance ${strategyBalance.toString()}`)
    console.log('loopEndActions - no withdraw actions')
  }

  protected async postLoopCheck() {
    await this.vault.doHardWork();

    await this.vault.connect(this.signer).getAllRewards();
    await this.vault.connect(this.user).getAllRewards();

    // strategy should not contain any tokens in the end
    const stratRtBalances = await StrategyTestUtils.saveStrategyRtBalances(this.strategy);
    for (const rtBal of stratRtBalances) {
      expect(rtBal).is.gt(0, 'Strategy not contains rewards');
    }

    console.log(`=============================`);
    // check vault balance
    const vaultBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.vault.address);
    console.log(`this.vaultRTBal ${this.vaultRTBal}`);
    console.log(`vaultBalanceAfter ${vaultBalanceAfter}`);

    expect(vaultBalanceAfter.sub(this.vaultRTBal)).is.not.eq("0", "vault reward should increase");

    // check ps balance
    const psBalanceAfter = await TokenUtils.balanceOf(this.core.rewardToken.address, this.core.psVault.address);
    expect(psBalanceAfter.sub(this.psBal)).is.not.eq("0", "ps balance should increase");
    console.log(`this.psBal ${this.psBal}`);
    console.log(`psBalanceAfter ${psBalanceAfter}`);

    // check ps PPFS
    const psSharePriceAfter = await this.core.psVault.getPricePerFullShare();
    expect(psSharePriceAfter.sub(this.psPPFS)).is.eq("0", "ps share price should not increase");
    console.log(`this.psPPFS ${this.psPPFS}`);
    console.log(`psSharePriceAfter ${psSharePriceAfter}`);

    // check reward for user
    const rewardBalanceAfter = await TokenUtils.balanceOf(this.core.psVault.address, this.user.address);
    expect(rewardBalanceAfter.sub(this.userRTBal).toString()).is.not.eq("0", "should have earned xTETU rewards");
    console.log(`this.userRTBal ${this.userRTBal}`);
    console.log(`rewardBalanceAfter ${rewardBalanceAfter}`);
    console.log(`=============================`);
  }
}
