import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";

const alreadyDeployed = new Set<string>([
  '17', // scFUSD
  '18', // scLINK
  '19', // scFRAX
  '20', // scDOLA
  '23', // scTUSD
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const infos = readFileSync('scripts/utils/download/data/scream_markets.csv', 'utf8').split(/\r?\n/);

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

  appendFileSync(`./tmp/deployed/SCREAM_STRATS_UPD.txt`, '-------------------\n', 'utf8');

  // *********** DEPLOY VAULT
  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const scTokenName = strat[1];
    const scTokenAddress = strat[2];
    const tokenAddress = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];
    const tvl = strat[7];

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

    console.log('strat', idx, scTokenName, vaultName);

    const strategyArgs = [
      core.controller,
      vault,
      tokenAddress,
      scTokenAddress,
      borrowTarget,
      collateralFactor
    ];
    const strategy = await DeployerUtils.deployContract(
      signer,
      'StrategyScreamFold',
      ...strategyArgs
    ) as IStrategy;

    await DeployerUtils.wait(5);

    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/fantom/scream/StrategyScreamFold.sol:StrategyScreamFold', strategyArgs);

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });
    const txt = `${tokenName} vault: ${vault} strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/deployed/SCREAM_STRATS_UPD.txt`, txt, 'utf8');
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
