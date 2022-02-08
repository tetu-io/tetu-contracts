import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {mkdir, readFileSync, writeFileSync} from "fs";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/beethoven_pools_10kk_tvl.csv', 'utf8').split(/\r?\n/);

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  for (const info of infos) {
    const strat = info.split(',');
    const idx = strat[0];
    const lpName = strat[1];
    const lpAddress = strat[2];
    const depositToken = strat[3];
    const beethovenPoolId = strat[4];
    const rewardToDepositPoolId = strat[5];

    if (idx === 'idx') {
      console.log('skip', idx);
      continue;
    }
    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    const vaultNameWithoutPrefix = `BEETS_${lpName}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, lpName, vaultNameWithoutPrefix);

    let strategyArgs;

    const data = await DeployerUtils.deployVaultAndStrategy(
      vaultNameWithoutPrefix,
      (vaultAddress) => {
        strategyArgs = [
            core.controller,
            lpAddress,
            vaultAddress,
            idx,
            depositToken,
            beethovenPoolId,
            rewardToDepositPoolId
          ];
        return DeployerUtils.deployContract(
          signer,
          'StrategyBeethoven',
          ...strategyArgs
        ) as Promise<IStrategy>
      },
      core.controller,
      core.psVault,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    );


    await DeployerUtils.wait(5);

    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithContractName(data[2].address, 'contracts/strategies/fantom/beethoven/StrategyBeethoven.sol:StrategyBeethoven', strategyArgs);

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });
    const txt = `vault: ${data[1].address}\nstrategy: ${data[2].address}`;
    writeFileSync(`./tmp/deployed/${vaultNameWithoutPrefix}.txt`, txt, 'utf8');
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
