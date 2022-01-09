import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/geist_markets.csv', 'utf8').split(/\r?\n/);

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

    const vaultNameWithoutPrefix = `${tokenName}`;

    if (vaultNames.has('TETU_' + vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('strat', idx, aTokenName, vaultNameWithoutPrefix);

    const collateralFactor = (ltv).toFixed(0);
    // on fantom we have low gas limit and not able to use full power of folding
    const borrowTarget = (ltv * 0.87).toFixed(0);

    let strategyArgs;

    const data = await DeployerUtils.deployVaultAndStrategy(
      vaultNameWithoutPrefix,
      (vaultAddress) => {
        strategyArgs = [
          core.controller,
          vaultAddress,
          tokenAddress,
          borrowTarget,
          collateralFactor
        ]
        return DeployerUtils.deployContract(
          signer,
          'StrategyGeistFold',
          ...strategyArgs
        ) as Promise<IStrategy>
      },
      core.controller,
      core.rewardToken,
      signer,
      60 * 60 * 24 * 28,
      0,
      true,
    );


    await DeployerUtils.wait(5);

    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithContractName(data[2].address, 'contracts/strategies/fantom/geist/StrategyGeistFold.sol:StrategyGeistFold', strategyArgs);

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });
    const txt = `vault: ${data[1].address} strategy: ${data[2].address}`;
    appendFileSync(`./tmp/deployed/GEIST.txt`, txt, 'utf8');
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
