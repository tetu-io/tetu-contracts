import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {ContractReader, IStrategy, TetuSwapFactory, TetuSwapPair} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {appendFileSync, mkdir} from "fs";

const excludeVaults = new Set<string>([]);

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  let strategyName = 'StrategyTetuSwap';
  let strategyPath = `contracts/strategies/matic/tetu/${strategyName}.sol:${strategyName}`;
  if ((await ethers.provider.getNetwork()).chainId === 250) {
    strategyName = 'StrategyTetuSwapFantom';
    strategyPath = `contracts/strategies/fantom/tetu/${strategyName}.sol:${strategyName}`;
  }

  const factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', core.swapFactory) as TetuSwapFactory;

  const length = (await factory.allPairsLength()).toNumber();

  const cReader = await DeployerUtils.connectContract(signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

  for (let i = 0; i < length; i++) {
    const pair = await factory.allPairs(i);
    const pairCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', pair) as TetuSwapPair;
    const token0 = await pairCtr.token0();
    const token1 = await pairCtr.token1();

    const token0Name = await TokenUtils.tokenSymbol(token0);
    const token1Name = await TokenUtils.tokenSymbol(token1);
    const vaultNameWithoutPrefix = `TETU_SWAP_${token0Name}_${token1Name}`;
    console.log('deploy', vaultNameWithoutPrefix, 'pair', pair);

    if (excludeVaults.has(vaultNameWithoutPrefix)) {
      console.log('already deployed');
      continue;
    }

    const vAdr = vaultsMap.get(vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log('Vault not found!', vaultNameWithoutPrefix);
      continue;
    }

    const strategyArgs = [core.controller, vAdr, pair];

    const strategy = await DeployerUtils.deployContract(signer, strategyName, ...strategyArgs) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    await DeployerUtils.wait(5);
    await DeployerUtils.verifyWithContractName(strategy.address, strategyPath, [
      ...strategyArgs
    ]);
  }


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
