import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";
import {Misc} from "../../../utils/tools/Misc";

const alreadyDeployed = new Set<string>([
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/geist_markets.csv', 'utf8').split(/\r?\n/);

  const vaultsByUnderlying = new Map<string, string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    const underlying = (await cReader.vaultUnderlying(vAdr)).toLowerCase();
    if (vaultsByUnderlying.has(underlying)) {
      throw Error('duplicate und');
    }
    vaultsByUnderlying.set(underlying, vAdr);
  }

  appendFileSync(`./tmp/deployed/GEIST_STRATS_UPD.txt`, '-------------------\n', 'utf8');
  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const tokenName = strat[1];
    const tokenAddress = strat[2];
    const aTokenName = strat[3];
    const aTokenAddress = strat[4];
    const dTokenName = strat[5];
    const dTokenAddress = strat[6];
    const ltv = +strat[7];
    const liquidationThreshold = strat[8];

    if (idx === 'idx' || !tokenAddress) {
      console.log('skip', idx);
      continue;
    }

    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    const vault = vaultsByUnderlying.get(tokenAddress.toLowerCase()) as string;
    const vaultName = await cReader.vaultUnderlying(vault);

    console.log('strat', idx, aTokenName, vaultName);

    const collateralFactor = (ltv).toFixed(0);
    const borrowTarget = (ltv * Misc.GEIST_BOR_RATIO).toFixed(0);

    const strategyArgs = [
      core.controller,
      vault,
      tokenAddress,
      borrowTarget,
      collateralFactor
    ];
    const strategy = await DeployerUtils.deployContract(
      signer,
      'StrategyGeistFold',
      ...strategyArgs
    ) as IStrategy;

    await DeployerUtils.wait(5);

    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/fantom/geist/StrategyGeistFold.sol:StrategyGeistFold', strategyArgs);

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });
    const txt = `${tokenName} vault: ${vault} strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/deployed/GEIST_STRATS_UPD.txt`, txt, 'utf8');
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
