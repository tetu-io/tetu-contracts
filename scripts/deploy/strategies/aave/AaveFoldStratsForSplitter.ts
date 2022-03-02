import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir, readFileSync} from "fs";

const splitters = [
  '0x4C095d11Fa462Da4c7Ccb4D8c2eC288b07291993',
  '0x26030c3e3790fF4e1236585f2650AE7da56a752C',
  '0xbB71CC21786b8d81A2e6cd821Af06C471b167207',
  '0x676418e9a927c58291808ff87fdFb5Dd04975aB2',
  '0x9F247D3b7bB4e419E825a2cFf9b3aF66e12306DE',
  '0x9F7d0D5C511C49d74026D4E9F9a6cBe8876E0947',
];

const alreadyDeployed = new Set<string>([
  '0',
  '1',
  '2',
  '3',
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);

  const splittersByUnderlying = new Map<string, string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const sAdr of splitters) {
    const underlying = (await cReader.vaultUnderlying(sAdr)).toLowerCase();
    if (splittersByUnderlying.has(underlying)) {
      throw Error('duplicate und');
    }
    splittersByUnderlying.set(underlying, sAdr);
  }

  appendFileSync(`./tmp/deployed/AAVE_STRATS_SPLITTER.txt`, '-------------------\n', 'utf8');
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

    const splitter = splittersByUnderlying.get(tokenAddress.toLowerCase()) as string;

    console.log('strat', idx, aTokenName);

    const collateralFactor = (ltv).toFixed(0);
    const borrowTarget = (ltv * 0.99).toFixed(0);

    const strategyArgs = [
      core.controller,
      splitter,
      tokenAddress,
      borrowTarget,
      collateralFactor
    ];
    const strategy = await DeployerUtils.deployContract(
      signer,
      'StrategyAaveFold',
      ...strategyArgs
    ) as IStrategy;

    mkdir('./tmp/deployed', {recursive: true}, (err) => {
      if (err) throw err;
    });
    const txt = `${tokenName} splitter: ${splitter} strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/deployed/AAVE_STRATS_SPLITTER.txt`, txt, 'utf8');

    await DeployerUtils.wait(5);

    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/aave/StrategyAaveFold.sol:StrategyAaveFold', strategyArgs);
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
