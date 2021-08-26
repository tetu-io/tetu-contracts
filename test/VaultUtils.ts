import {ContractReader, Controller, SmartVault} from "../typechain";
import {expect} from "chai";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Erc20Utils} from "./Erc20Utils";
import {BigNumber, utils} from "ethers";

export class VaultUtils {

  constructor(public vault: SmartVault) {
  }

  public async checkEmptyVault(
      strategy: string,
      unerlying: string,
      vaultRewardToken0: string,
      deployer: string,
      toInvestNumerator: number,
      toInvestDenominator: number,
      duration: number
  ) {
    const vault = this.vault;
    // vault storage initial stats
    expect(await vault.decimals()).to.eq(6);
    expect(await vault.strategy()).to.eq(strategy);
    expect((await vault.underlying()).toLowerCase()).to.eq(unerlying);
    expect(await vault.underlyingUnit()).to.eq(1000000);
    expect(await vault.duration()).to.eq(duration);
    expect(await vault.active()).to.eq(true);
    // vault stats
    expect(await vault.underlyingBalanceInVault()).to.eq(0);
    expect(await vault.underlyingBalanceWithInvestment()).to.eq(0);
    expect(await vault.underlyingBalanceWithInvestmentForHolder(deployer)).to.eq(0);
    expect(await vault.getPricePerFullShare()).to.eq(1000000);
    expect(await vault.availableToInvestOut()).to.eq(0);
    expect(await vault.earned(vaultRewardToken0, deployer)).to.eq(0);
    expect(await vault.rewardPerToken(vaultRewardToken0)).to.eq(0);
    expect(await vault.lastTimeRewardApplicable(vaultRewardToken0)).to.eq(0);
    expect(await vault.rewardTokensLength()).to.eq(1);
    expect(await vault.getRewardTokenIndex(vaultRewardToken0)).to.eq(0);
    expect(await vault.periodFinishForToken(vaultRewardToken0)).to.eq(0);
    expect(await vault.rewardRateForToken(vaultRewardToken0)).to.eq(0);
    expect(await vault.lastUpdateTimeForToken(vaultRewardToken0)).to.eq(0);
    expect(await vault.rewardPerTokenStoredForToken(vaultRewardToken0)).to.eq(0);
  }

  public static async profitSharingRatio(controller: Controller): Promise<number> {
    const ratio = (await controller.psNumerator()).toNumber()
        / (await controller.psDenominator()).toNumber();
    expect(ratio).is.not.lessThan(0);
    expect(ratio).is.not.greaterThan(100);
    return ratio;
  }

  public static async deposit(
      user: SignerWithAddress,
      vault: SmartVault,
      amount: BigNumber
  ) {
    const vaultForUser = vault.connect(user);
    const underlying = await vaultForUser.underlying();
    const dec = await Erc20Utils.decimals(underlying);
    const bal = await Erc20Utils.balanceOf(underlying, user.address);
    console.log('balance', utils.formatUnits(bal, dec), bal.toString());
    expect(+utils.formatUnits(bal, dec))
    .is.greaterThanOrEqual(+utils.formatUnits(amount, dec), 'not enough balance')

    await Erc20Utils.approve(underlying, user, vault.address, amount.toString());
    console.log('deposit', BigNumber.from(amount).toString())
    return await vaultForUser.depositAndInvest(BigNumber.from(amount));
  }

  public static async vaultApr(vault: SmartVault, rt: string, cReader: ContractReader, rtDec = 18) {
    const rewardPerToken = +utils.formatUnits(await vault.rewardPerToken(rt), rtDec);
    const totalSupply = +utils.formatUnits(await vault.totalSupply());
    const finish = (await vault.periodFinishForToken(rt)).toNumber();
    const duration = (await vault.duration()).toNumber();
    const tvlUsd = +utils.formatUnits(await cReader.vaultTvlUsdc(vault.address));
    const rtPrice = +utils.formatUnits(await cReader.getPrice(rt));

    const now = +(Date.now() / 1000).toFixed(0);
    const currentPeriod = finish - now;
    const periodRate = currentPeriod / duration;

    const rewardsForFullPeriod = rewardPerToken * totalSupply * rtPrice;

    const currentRewardsAmount = rewardsForFullPeriod * periodRate;

    const rewardsPerTvlRatio = currentRewardsAmount / tvlUsd;
    return ((currentRewardsAmount / tvlUsd) / (duration / (60 * 60 * 24))) * 365 * 100;
  }

}
