import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {
  ContractReader, IStrategy,
  NoopStrategy,
  SmartVault,
  TetuSwapFactory,
  TetuSwapPair
} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {TokenUtils} from "../../../test/TokenUtils";
import {appendFileSync, mkdir} from "fs";

const REWARDS_DURATION = 60 * 60 * 24 * 28; // 28 days
const STRATEGY_NAME = 'StrategyTetuSwap';

const excludeVaults = new Set<string>([
]);

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

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
      return;
    }

    const strategyArgs = [core.controller, vAdr, pair];

    const strategy = await DeployerUtils.deployContract(signer, STRATEGY_NAME, ...strategyArgs) as IStrategy;

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vAdr}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/strategies.txt`, txt, 'utf8');

    await DeployerUtils.wait(5);
    await DeployerUtils.verifyWithContractName(strategy.address, `contracts/strategies/matic/tetu/${STRATEGY_NAME}.sol:${STRATEGY_NAME}`, [
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
