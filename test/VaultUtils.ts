import {ContractReader, Controller, IStrategy, SmartVault} from "../typechain";
import {expect} from "chai";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TokenUtils} from "./TokenUtils";
import {BigNumber, ContractTransaction, utils} from "ethers";
import axios from "axios";
import {MintHelperUtils} from "./MintHelperUtils";
import {CoreContractsWrapper} from "./CoreContractsWrapper";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";

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
  ): Promise<ContractTransaction> {
    const vaultForUser = vault.connect(user);
    const underlying = await vaultForUser.underlying();
    const dec = await TokenUtils.decimals(underlying);
    const bal = await TokenUtils.balanceOf(underlying, user.address);
    console.log('balance', utils.formatUnits(bal, dec), bal.toString());
    expect(+utils.formatUnits(bal, dec))
      .is.greaterThanOrEqual(+utils.formatUnits(amount, dec), 'not enough balance')

    await TokenUtils.approve(underlying, user, vault.address, amount.toString());
    console.log('deposit', BigNumber.from(amount).toString());
    if (invest) {
      return vaultForUser.depositAndInvest(BigNumber.from(amount));
    } else {
      return vaultForUser.deposit(BigNumber.from(amount));
    }
  }

  public static async exit(
    user: SignerWithAddress,
    vault: SmartVault
  ): Promise<ContractTransaction> {
    const vaultForUser = vault.connect(user);
    return vaultForUser.exit();
  }

  public static async vaultApr(vault: SmartVault, rt: string, cReader: ContractReader): Promise<number> {
    const rtDec = await TokenUtils.decimals(rt);
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
    const rtDec = await TokenUtils.decimals(rt);
    const rewardRateForToken = +utils.formatUnits(await vault.rewardRateForToken(rt), rtDec);
    const duration = (await vault.duration()).toNumber();
    return rewardRateForToken * duration;
  }

  public static async vaultRewardsAmountCurrent(vault: SmartVault, rt: string): Promise<number> {
    const rtDec = await TokenUtils.decimals(rt);
    const rewardRateForToken = +utils.formatUnits(await vault.rewardRateForToken(rt), rtDec);
    const duration = (await vault.duration()).toNumber();
    const finish = (await vault.periodFinishForToken(rt)).toNumber();

    const now = +(Date.now() / 1000).toFixed(0);
    const currentPeriod = finish - now;
    const periodRate = currentPeriod / duration;

    return rewardRateForToken * duration * periodRate;
  }

  public static async getVaultInfoFromServer() {
    return (await axios.get("https://tetu-server-staging.herokuapp.com//api/v1/reader/vaultInfos?network=MATIC")).data;
  }

  public static async addRewardsXTetu(
    signer: SignerWithAddress,
    vault: SmartVault,
    core: CoreContractsWrapper,
    amount: number,
    period = 60 * 60 * 24 * 7 + 1
  ) {
    console.log("Add xTETU as reward to vault: ", amount.toString())
    const rtAdr = core.psVault.address;
    await MintHelperUtils.mint(core.controller, core.announcer, amount + '', signer.address, period);
    await TokenUtils.approve(core.rewardToken.address, signer, core.psVault.address, utils.parseUnits(amount + '').toString());
    await core.psVault.deposit(utils.parseUnits(amount + ''));
    await TokenUtils.approve(rtAdr, signer, vault.address, utils.parseUnits(amount + '').toString());
    await vault.notifyTargetRewardAmount(rtAdr, utils.parseUnits(amount + ''));
  }

  public static async addRewards(
    signer: SignerWithAddress,
    vault: SmartVault,
    rtAdr: string,
    amount: BigNumber
  ) {
    console.log("Add rewards to vault: ", amount.toString())
    await TokenUtils.approve(rtAdr, signer, vault.address, amount.toString());
    await vault.notifyTargetRewardAmount(rtAdr, amount);
  }

  public static async doHardWorkAndCheck(vault: SmartVault, positive = true) {
    const controller = await vault.controller();
    const controllerCtr = await DeployerUtils.connectInterface(vault.signer as SignerWithAddress, 'Controller', controller) as Controller;
    const psVault = await controllerCtr.psVault();
    const psVaultCtr = await DeployerUtils.connectInterface(vault.signer as SignerWithAddress, 'SmartVault', psVault) as SmartVault;
    const und = await vault.underlying();
    const undDec = await TokenUtils.decimals(und);
    const rt = (await vault.rewardTokens())[0];
    const psRatio = (await controllerCtr.psNumerator()).toNumber() / (await controllerCtr.psDenominator()).toNumber()
    const strategy = await vault.strategy();
    const strategyCtr = await DeployerUtils.connectInterface(vault.signer as SignerWithAddress, 'IStrategy', strategy) as IStrategy

    const ppfs = +utils.formatUnits(await vault.getPricePerFullShare(), undDec);
    const undBal = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);
    const psPpfs = +utils.formatUnits(await psVaultCtr.getPricePerFullShare());
    const rtBal = +utils.formatUnits(await TokenUtils.balanceOf(rt, vault.address));

    await vault.doHardWork();

    const ppfsAfter = +utils.formatUnits(await vault.getPricePerFullShare(), undDec);
    const undBalAfter = +utils.formatUnits(await vault.underlyingBalanceWithInvestment(), undDec);
    const psPpfsAfter = +utils.formatUnits(await psVaultCtr.getPricePerFullShare());
    const rtBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(rt, vault.address));
    const bbRatio = +utils.formatUnits(await strategyCtr.buyBackRatio());

    console.log('-------- HARDWORK --------');
    console.log('- PPFS change:', ppfsAfter - ppfs);
    console.log('- BALANCE change:', undBalAfter - undBal);
    console.log('- RT change:', rtBalAfter - rtBal);
    console.log('- PS change:', psPpfsAfter - psPpfs);
    console.log('- PS ratio:', psRatio);
    console.log('--------------------------');

    if (positive && bbRatio > 1000) {
      expect(psPpfsAfter).is.greaterThan(psPpfs);
      if (psRatio !== 1) {
        expect(rtBalAfter).is.greaterThan(rtBal);
      }
    }
    if (bbRatio !== 10000) {
      expect(ppfsAfter).is.greaterThan(ppfs);
    }
  }

}
