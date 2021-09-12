import {ContractReader, Controller, SmartVault} from "../typechain";
import {expect} from "chai";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Erc20Utils} from "./Erc20Utils";
import {BigNumber, utils} from "ethers";
import axios from "axios";

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
      amount: BigNumber,
      invest = true
  ) {
    const vaultForUser = vault.connect(user);
    const underlying = await vaultForUser.underlying();
    const dec = await Erc20Utils.decimals(underlying);
    const bal = await Erc20Utils.balanceOf(underlying, user.address);
    console.log('balance', utils.formatUnits(bal, dec), bal.toString());
    expect(+utils.formatUnits(bal, dec))
    .is.greaterThanOrEqual(+utils.formatUnits(amount, dec), 'not enough balance')

    await Erc20Utils.approve(underlying, user, vault.address, amount.toString());
    console.log('deposit', BigNumber.from(amount).toString());
    if(invest) {
      return await vaultForUser.depositAndInvest(BigNumber.from(amount));
    } else {
      return await vaultForUser.deposit(BigNumber.from(amount));
    }
  }

  public static async vaultApr(vault: SmartVault, rt: string, cReader: ContractReader): Promise<number> {
    const rtDec = await Erc20Utils.decimals(rt);
    const undDec = await vault.decimals();
    const rewardRateForToken = +utils.formatUnits(await vault.rewardRateForToken(rt), rtDec);
    const totalSupply = +utils.formatUnits(await vault.totalSupply(), undDec);
    const finish = (await vault.periodFinishForToken(rt)).toNumber();
    const duration = (await vault.duration()).toNumber();
    const tvlUsd = +utils.formatUnits(await cReader.vaultTvlUsdc(vault.address));
    const rtPrice = +utils.formatUnits(await cReader.getPrice(rt));

    const now = +(Date.now() / 1000).toFixed(0);
    const currentPeriod = finish - now;
    const periodRate = currentPeriod / duration;
    const rewardsForFullPeriodUsd = rewardRateForToken * duration * rtPrice;
    const currentRewardsAmountUsd = rewardsForFullPeriodUsd * periodRate;

    console.log('----------- APR CALCULATION -----------');
    console.log('rewardRateForToken', rewardRateForToken);
    console.log('totalSupply', totalSupply);
    console.log('finish', finish);
    console.log('duration', duration);
    console.log('tvlUsd', tvlUsd);
    console.log('rtPrice', rtPrice);
    console.log('currentPeriod', currentPeriod);
    console.log('periodRate', periodRate);
    console.log('rewardsForFullPeriodUsd', rewardsForFullPeriodUsd, rewardRateForToken * duration);
    console.log('currentRewardsAmountUsd', currentRewardsAmountUsd);
    console.log('---------------------------------------');

    return ((currentRewardsAmountUsd / tvlUsd) / (duration / (60 * 60 * 24))) * 365 * 100;
  }

  public static async vaultRewardsAmount(vault: SmartVault, rt: string): Promise<number> {
    const rtDec = await Erc20Utils.decimals(rt);
    const rewardRateForToken = +utils.formatUnits(await vault.rewardRateForToken(rt), rtDec);
    const duration = (await vault.duration()).toNumber();
    return rewardRateForToken * duration;
  }

  public static async vaultRewardsAmountCurrent(vault: SmartVault, rt: string): Promise<number> {
    const rtDec = await Erc20Utils.decimals(rt);
    const rewardRateForToken = +utils.formatUnits(await vault.rewardRateForToken(rt), rtDec);
    const duration = (await vault.duration()).toNumber();
    const finish = (await vault.periodFinishForToken(rt)).toNumber();

    const now = +(Date.now() / 1000).toFixed(0);
    const currentPeriod = finish - now;
    const periodRate = currentPeriod / duration;

    return rewardRateForToken * duration * periodRate;
  }

  public static async getVaultInfoFromServer() {
    // return (await axios.get("https://api.tetu.io/api/v1/reader/vaultInfos?network=MATIC")).data;
    return (await axios.get("http://localhost:8080/api/v1/reader/vaultInfos?network=MATIC")).data;
  }

}
