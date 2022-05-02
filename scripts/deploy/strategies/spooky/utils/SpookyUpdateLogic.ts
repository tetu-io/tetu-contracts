import {ethers, network} from "hardhat";
import {DeployerUtils} from "../../../DeployerUtils";
import {
  deploySingleStrategy,
  findAllVaults
} from "../../curve/utils/CurveUpdateUtils";
import {readFileSync} from "fs";
import {IStrategy} from "../../../../../typechain";

/**
 * Deploy given Spooky strategy to Fantom.
 * Assume here, that the constructor of the strategy has following params:
 *         controller
 *         vaultAddress
 *         lpAddress (== underline)
 *         token0
 *         token1
 *         idx (== pool id)
 * Return array of successfully deployed strategies.
 *
 * @param srcDataSpookyPoolsCsv i.e. 'scripts/utils/download/data/spooky_pools.csv'
 * @param strategyName
 * @param strategyContractPath
 *    if not empty, then it's not necessary to search vaults address - we should just use provided address for vault
 *    (usefull for tests)
 * @param onSuccessDeploy
 *    i.e. function to save deployed strategy to update.txt immediately after deploying
 */
export async function updateSpookyStrategy(
  srcDataSpookyPoolsCsv: string,
  strategyName: string,
  strategyContractPath: string,
  onSuccessDeploy?: (vaultNameWithoutPrefix: string, vaultAddress: string, strategy: IStrategy) => void
) : Promise<IStrategy[]> {
  console.log("network.name", network.name);

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const vaultsMap: Map<string, string> = await findAllVaults(signer, tools);
  const infos = readFileSync(srcDataSpookyPoolsCsv, 'utf8').split(/\r?\n/);

  // tslint:disable-next-line:no-any
  const deployed: any[] = [];

  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !idx) {
      console.log('skip', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `SPOOKY_${token0Name}_${token1Name}`;

    const vaultAddress: string | undefined = vaultsMap.get(vaultNameWithoutPrefix);
    if (!vaultAddress) {
      console.log(`Vault is not found ${vaultNameWithoutPrefix}, skipped`);
      continue;
    }

    const strategyConstructorParams = [
      core.controller,
      vaultAddress,
      lpAddress,
      token0,
      token1,
      idx
    ];

    const strategy: IStrategy | undefined = await deploySingleStrategy(signer, core, vaultNameWithoutPrefix, vaultAddress, strategyName, strategyConstructorParams);
    if (strategy) {
      if (onSuccessDeploy) {
        onSuccessDeploy(vaultNameWithoutPrefix, vaultAddress, strategy);
      }

      deployed.push([vaultNameWithoutPrefix, vaultAddress, strategy, strategyConstructorParams]);
      console.log(`strat ${idx} ${lpName} was deployed as ${strategy.address}`);
    } else {
      console.log(`strat ${idx} ${lpName} wasn't deployed`);
    }
  }

  await DeployerUtils.wait(5);

  const deployedStrategies: IStrategy[] = [];
  for (const data of deployed) {
    if (network.name === "hardhat") {
      await testStrategyAfterUpgradeOnHardhat(signer, core, data[2], data[1]);
    } else {
      await verifySingleStrategy(data[2].address, strategyContractPath, data[3]);
    }
    deployedStrategies.push(data[2]);
  }

  return deployedStrategies;
}