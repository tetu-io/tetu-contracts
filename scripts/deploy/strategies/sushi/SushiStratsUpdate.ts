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

  await appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;
  const vaultController = await DeployerUtils.connectContract(signer, "VaultController", core.vaultController) as VaultController;

  const infos = readFileSync('scripts/utils/download/data/sushi_pools.csv', 'utf8').split(/\r?\n/);

  const deployed = [];

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (let vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

  for (let info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx' || !idx) {
      console.log('skip', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `SUSHI_${token0_name}_${token1_name}`;

    const vAdr = vaultsMap.get('TETU_' + vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log('Vault not found!', vaultNameWithoutPrefix);
      return;
    }

    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vAdr) as SmartVault;

    if (!(await vCtr.active())) {
      console.log('vault not active', vAdr)
      continue;
    }

    console.log('strat', idx, lp_name);

    const strategy = await DeployerUtils.deployContract(
        signer,
        'StrategySushiSwapLp',
        core.controller,
        vAdr,
        lp_address,
        token0,
        token1,
        idx
    ) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    await appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/sushiswap/StrategySushiSwapLp.sol:StrategySushiSwapLp', [
        core.controller,
        vAdr,
        lp_address,
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
