import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, IController, IStrategy, PriceCalculator} from "../../typechain";
import {Erc20Utils} from "../../test/Erc20Utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;


  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (let vault of vaults) {
    let vInfoWithUser;
    try {
      vInfoWithUser = await cReader.vaultWithUserInfos(signer.address, [vault]);
    } catch (e) {
      console.error('error fetch vault info', vault);
      await checkVaultFields(vault);
      return;
    }

    console.log('vault is ok', vInfoWithUser[0].vault.name)
  }


}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

async function checkVaultFields(vaultAddress: string) {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;
  const priceCalculator = await DeployerUtils.connectContract(
      signer, "PriceCalculator", tools.calculator) as PriceCalculator;
  const controller = await DeployerUtils.connectInterface(signer, 'IController', core.controller) as IController;

  const vaultContract = await DeployerUtils.connectVault(vaultAddress, signer);
  const strat = await vaultContract.strategy();
  const stratI = await DeployerUtils.connectInterface(signer, 'IStrategy', strat) as IStrategy;
  const vUnd = await vaultContract.underlying();
  const rewardTokens = await vaultContract.rewardTokens();
  const tetu = await controller.rewardToken();
  const dec = await Erc20Utils.decimals(tetu);

  console.log('vaultName', await cReader.vaultName(vaultAddress));
  console.log('vaultCreated', await cReader.vaultCreated(vaultAddress));
  console.log('vaultActive', await cReader.vaultActive(vaultAddress));
  console.log('vaultTvl', await cReader.vaultTvl(vaultAddress));
  console.log('vaultTvlUsdc', await cReader.vaultTvlUsdc(vaultAddress));
  console.log('vaultDecimals', await cReader.vaultDecimals(vaultAddress));
  console.log('vaultUnderlying', await cReader.vaultUnderlying(vaultAddress));
  console.log('vaultRewardTokens', await cReader.vaultRewardTokens(vaultAddress));
  console.log('vaultRewardTokensBal', await cReader.vaultRewardTokensBal(vaultAddress));
  console.log('vaultRewardTokensBalUsdc', await cReader.vaultRewardTokensBalUsdc(vaultAddress));
  console.log('vaultDuration', await cReader.vaultDuration(vaultAddress));
  console.log('vaultRewardsApr', await cReader.vaultRewardsApr(vaultAddress));
  console.log('vaultPpfsApr', await cReader.vaultPpfsApr(vaultAddress));
  console.log('vaultUsers', await cReader.vaultUsers(vaultAddress));
  console.log('strategy', strat);
  console.log('strategyCreated', await cReader.strategyCreated(strat));
  console.log('strategyPlatform', await cReader.strategyPlatform(strat));
  console.log('strategyAssets', await cReader.strategyAssets(strat));
  console.log('strategyRewardTokens', await cReader.strategyRewardTokens(strat));
  console.log('strategyPausedInvesting', await stratI.pausedInvesting());
  console.log('strategyEarned', await bookkeeper.targetTokenEarned(strat));

  console.log('userUnderlyingBalance', await cReader.userUnderlyingBalance(signer.address, vaultAddress));
  console.log('userUnderlyingBalanceUsdc', await cReader.userUnderlyingBalanceUsdc(signer.address, vaultAddress));
  console.log('userDepositedUnderlying', await cReader.userDepositedUnderlying(signer.address, vaultAddress));
  console.log('userDepositedUnderlyingUsdc', await cReader.userDepositedUnderlyingUsdc(signer.address, vaultAddress));
  console.log('userDepositedShare', await cReader.userDepositedShare(signer.address, vaultAddress));
  console.log('rewardTokens', rewardTokens);
  console.log('userRewards', await cReader.userRewards(signer.address, vaultAddress));
  console.log('userRewardsUsdc', await cReader.userRewardsUsdc(signer.address, vaultAddress));

  for (let rt of rewardTokens) {
    console.log('earned', rt, await vaultContract.earned(rt, signer.address));
  }

  console.log(await priceCalculator.getPriceWithDefaultOutput(vUnd));

  console.log('tetu', tetu);
  console.log('dec', dec);
  console.log('v info', (await cReader.vaultInfo(vaultAddress)).name);
  console.log('user info', (await cReader.userInfo(signer.address, vaultAddress)).depositedUnderlying);

  try {
    console.log('v info with user', await cReader.vaultWithUserInfos(signer.address, [vaultAddress]));
  } catch (e) {
    console.log('still cant fetch vault+user info');
  }
}
