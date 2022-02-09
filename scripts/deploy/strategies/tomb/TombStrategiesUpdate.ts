import {appendFileSync, mkdir, readFileSync} from "fs";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader} from "../../../../typechain";
import {ethers} from "hardhat";

const needToDeploy = new Set<string>([
  '0','1'
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/tomb_pools.csv', 'utf8').split(/\r?\n/);

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

  // *********** DEPLOY
  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];

    if (idx === 'idx' || !token1Name) {
      console.log('skip', idx);
      continue;
    }

    if (!needToDeploy.has(idx)) {
      console.log('skip', idx);
      continue;
    }

    // *** VARIABLES
    const strategyContractName = 'StrategyTombLp';
    const strategyPath = `contracts/strategies/fantom/tomb/${strategyContractName}.sol:${strategyContractName}`;
    const underlying = lpAddress;
    const platformPrefix = 'TOMB';
    // *****

    const vaultNameWithoutPrefix = `${platformPrefix}_${token0Name}_${token1Name}`;

    const vAdr = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log('Vault not found!', vaultNameWithoutPrefix);
      return;
    }

    console.log('strat', idx, lpName);

    const strategyArgs = [
      core.controller,
      vAdr,
      underlying,
      token0,
      token1,
      idx
    ];
    const strategy = await DeployerUtils.deployContract(
        signer,
        strategyContractName,
        ...strategyArgs
    );

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(strategy.address, strategyPath, strategyArgs);
    }
    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });

    const txt = `${vaultNameWithoutPrefix} vault: ${vAdr}\nstrategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/deployed/${platformPrefix}_updated.txt`, txt, 'utf8');
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
