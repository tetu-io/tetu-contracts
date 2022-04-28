import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy, SmartVault} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const infos = readFileSync('scripts/utils/download/data/quick_pools_dual.csv', 'utf8').split(/\r?\n/);

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

    const ids = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const pool = strat[7];
    const duration = strat[9];
    const r1 = strat[15];
    const rewards = [MaticAddresses.QUICK_TOKEN, r1];

    if (+duration <= 0 || !token0 || ids === 'idx') {
      console.log('skip', ids);
      continue;
    }

    const vaultNameWithoutPrefix = `QUICK_${token0Name}_${token1Name}`;

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

    console.log('strat', pool, lpName, vAdr, lpAddress, token0, token1);

    const strategy = await DeployerUtils.deployContract(
        signer,
        'StrategyQuickSwapLpDualAC',
        core.controller,
        vAdr,
        lpAddress,
        token0,
        token1,
        pool,
        rewards
    ) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/quick/StrategyQuickSwapLpDualAC.sol:StrategyQuickSwapLpDualAC', [
        core.controller,
        vAdr,
        lpAddress,
        token0,
        token1,
        pool
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
