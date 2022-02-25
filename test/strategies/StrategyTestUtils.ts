import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {UniswapUtils} from "../UniswapUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ForwarderV2, IStrategy, IUniswapV2Pair, PriceCalculator, SmartVault} from "../../typechain";
import {TokenUtils} from "../TokenUtils";
import {BigNumber, utils} from "ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {readFileSync} from "fs";
import {Misc} from "../../scripts/utils/tools/Misc";
import {DeployInfo} from "./DeployInfo";
import logSettings from "../../log_settings";
import {Logger} from "tslog";
import {PriceCalculatorUtils} from "../PriceCalculatorUtils";

const log: Logger = new Logger(logSettings);

export class StrategyTestUtils {

  public static async deploy(
    signer: SignerWithAddress,
    core: CoreContractsWrapper,
    vaultName: string,
    strategyDeployer: (vaultAddress: string) => Promise<IStrategy>,
    underlying: string,
    depositFee = 0,
  ): Promise<[SmartVault, IStrategy, string]> {
    const start = Date.now();
    log.info("Starting deploy")
    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
      underlying,
      vaultName,
      strategyDeployer,
      core.controller,
      core.vaultController,
      core.psVault.address,
      signer,
      60 * 60 * 24 * 28,
      depositFee
    );
    log.info("Vault deployed")
    const vault = data[1] as SmartVault;
    const strategy = data[2] as IStrategy;

    const rewardTokenLp = await UniswapUtils.createTetuUsdc(
      signer, core, "1000000"
    );
    log.info("LP created");

    await core.feeRewardForwarder.addLargestLps([core.rewardToken.address], [rewardTokenLp]);
    log.info("Path setup completed");

    expect((await strategy.underlying()).toLowerCase()).is.eq(underlying.toLowerCase());
    expect((await vault.underlying()).toLowerCase()).is.eq(underlying.toLowerCase());

    Misc.printDuration('Vault and strategy deployed and initialized', start);
    return [vault, strategy, rewardTokenLp];
  }

  public static async checkStrategyRewardsBalance(strategy: IStrategy, balances: string[]) {
    const tokens = await strategy.rewardTokens();
    const bbRatio = await strategy.buyBackRatio();
    if (bbRatio.toNumber() < 1000) {
      return;
    }
    for (let i = 0; i < tokens.length; i++) {
      const rtDec = await TokenUtils.decimals(tokens[i]);
      const expected = utils.formatUnits(balances[i] || 0, rtDec);
      expect(+utils.formatUnits(await TokenUtils.balanceOf(tokens[i], strategy.address), rtDec))
        .is.approximately(+expected, 0.0000000001, 'strategy has wrong reward balance for ' + i);
    }
  }

  public static async deposit(
    user: SignerWithAddress,
    vault: SmartVault,
    underlying: string,
    deposit: string
  ) {
    const dec = await TokenUtils.decimals(underlying);
    const bal = await TokenUtils.balanceOf(underlying, user.address);
    log.info('balance', utils.formatUnits(bal, dec), bal.toString());
    expect(+utils.formatUnits(bal, dec))
      .is.greaterThanOrEqual(+utils.formatUnits(deposit, dec), 'not enough balance')
    const vaultForUser = vault.connect(user);
    await TokenUtils.approve(underlying, user, vault.address, deposit);
    log.info('deposit', BigNumber.from(deposit).toString())
    await vaultForUser.depositAndInvest(BigNumber.from(deposit));
  }

  public static async saveStrategyRtBalances(strategy: IStrategy): Promise<BigNumber[]> {
    const rts = await strategy.rewardTokens();
    const balances: BigNumber[] = [];
    for (const rt of rts) {
      const b = await TokenUtils.balanceOf(rt, strategy.address);
      console.log('rt balance in strategy', rt, b);
      balances.push(b);
    }
    return balances;
  }

  public static async commonTests(strategy: IStrategy, underlying: string) {
    expect(await strategy.unsalvageableTokens(underlying)).is.eq(true);
    expect(await strategy.unsalvageableTokens(MaticAddresses.ZERO_ADDRESS)).is.eq(false);
    expect((await strategy.buyBackRatio()).toNumber()).is.lessThanOrEqual(100_00)
    expect(await strategy.platform()).is.not.eq(0);
    expect((await strategy.assets()).length).is.not.eq(0);
    expect(!!(await strategy.poolTotalAmount())).is.eq(true);
    await strategy.emergencyExit();
    expect(await strategy.pausedInvesting()).is.eq(true);
    await strategy.continueInvesting();
    expect(await strategy.pausedInvesting()).is.eq(false);
  }

  public static async initForwarder(forwarder: ForwarderV2) {
    const start = Date.now();
    await forwarder.setLiquidityNumerator(30);
    await forwarder.setLiquidityRouter(await DeployerUtils.getRouterByFactory(await DeployerUtils.getDefaultNetworkFactory()));
    await StrategyTestUtils.setConversionPaths(forwarder);
    Misc.printDuration('Forwarder initialized', start);
  }

  public static async setConversionPaths(forwarder: ForwarderV2) {
    const net = (await ethers.provider.getNetwork()).chainId;
    const bc: string[] = JSON.parse(readFileSync(`./test/strategies/data/${net}/bc.json`, 'utf8'));

    const batch = 20;
    for (let i = 0; i < bc.length / batch; i++) {
      const l = bc.slice(i * batch, i * batch + batch)
      log.info('addBlueChipsLps', l.length);
      await forwarder.addBlueChipsLps(l);
    }

    const tokens: string[] = JSON.parse(readFileSync(`./test/strategies/data/${net}/tokens.json`, 'utf8'));
    const lps: string[] = JSON.parse(readFileSync(`./test/strategies/data/${net}/lps.json`, 'utf8'));
    for (let i = 0; i < tokens.length / batch; i++) {
      const t = tokens.slice(i * batch, i * batch + batch)
      const l = lps.slice(i * batch, i * batch + batch)
      // log.info('t', t)
      // log.info('l', l)
      log.info('addLargestLps', t.length);
      await forwarder.addLargestLps(t, l);
    }
  }

  public static async deployCoreAndInit(deployInfo: DeployInfo, deploy: boolean) {
    const start = Date.now();
    const signer = await DeployerUtils.impersonate();
    if (deploy) {
      deployInfo.core = await DeployerUtils.deployAllCoreContracts(signer);
      deployInfo.tools = await DeployerUtils.deployAllToolsContracts(signer, deployInfo.core);
      await StrategyTestUtils.initForwarder(deployInfo.core.feeRewardForwarder);
    } else {
      deployInfo.core = await DeployerUtils.getCoreAddressesWrapper(signer);
      deployInfo.tools = await DeployerUtils.getToolsAddressesWrapper(signer);
    }
    Misc.printDuration('Deploy core contracts completed', start);
  }

  public static async getUnderlying(
    underlying: string,
    amountN: number,
    signer: SignerWithAddress,
    calculator: PriceCalculator,
    recipients: string[],
  ) {
    log.info('get underlying', amountN, recipients.length, underlying);
    const start = Date.now();
    const uName = await TokenUtils.tokenSymbol(underlying);
    const uDec = await TokenUtils.decimals(underlying);
    const uPrice = await PriceCalculatorUtils.getPriceCached(underlying, calculator);
    const uPriceN = +utils.formatUnits(uPrice);
    log.info('Underlying price: ', uPriceN);

    const amountAdjustedN = amountN / uPriceN;
    const amountAdjusted = utils.parseUnits(amountAdjustedN.toFixed(uDec), uDec);
    log.info('Get underlying: ', uName, amountAdjustedN);

    // const amountAdjustedN2 = amountAdjustedN * (recipients.length + 1);
    const amountAdjusted2 = amountAdjusted.mul(recipients.length + 1);

    let isLp = false;
    try {
      await (await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', underlying) as IUniswapV2Pair).getReserves();
      isLp = true;
    } catch (e) {
    }

    let balance = amountAdjusted2;
    if (isLp) {
      await UniswapUtils.getTokensAndAddLiq(
        signer,
        underlying,
        amountN,
        calculator
      );
      balance = await TokenUtils.balanceOf(underlying, signer.address);
    } else {
      await TokenUtils.getToken(underlying, signer.address, amountAdjusted2);
    }

    for (const recipient of recipients) {
      await TokenUtils.transfer(underlying, signer, recipient, balance.div(recipients.length + 1).toString())
    }
    const finalBal = await TokenUtils.balanceOf(underlying, signer.address);
    Misc.printDuration('Get underlying finished for', start);
    return finalBal;
  }

}
