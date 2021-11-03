import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  ContractReader,
  Controller,
  IStrategy,
  SmartVault,
  VaultController
} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const infos = readFileSync('scripts/utils/download/data/wault_pools.csv', 'utf8').split(/\r?\n/);

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

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

    if (+alloc <= 0 || idx === 'idx' || !idx || !strat[5]) {
      console.log('skip', idx, lpName, token0Name, token1Name);
      continue;
    }

    let vaultNameWithoutPrefix: string;
    if (token1) {
      vaultNameWithoutPrefix = `WAULT_${token0Name}_${token1Name}`;
    } else {
      vaultNameWithoutPrefix = `WAULT_${token0Name}`;
    }

    const vAdr = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log('Vault not found!', vaultNameWithoutPrefix);
      return;
    }

    console.log('strat', idx, lpName);

    const strategy = await DeployerUtils.deployContract(
        signer,
        'StrategyWaultLpWithAc',
        core.controller,
        vAdr,
        lpAddress,
        token0,
        token1,
        idx
    ) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/wault/StrategyWaultLpWithAc.sol:StrategyWaultLpWithAc', [
        core.controller,
        vAdr,
        lpAddress,
        token0,
        token1,
        idx
      ]);
    }
  }


}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
