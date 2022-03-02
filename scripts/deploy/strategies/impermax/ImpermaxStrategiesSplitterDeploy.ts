import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, StrategyImpermax__factory} from "../../../../typechain";
import {appendFileSync, readFileSync} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";

const splitters = [
  "0x4C095d11Fa462Da4c7Ccb4D8c2eC288b07291993",
  "0x26030c3e3790fF4e1236585f2650AE7da56a752C",
  "0xbB71CC21786b8d81A2e6cd821Af06C471b167207",
  "0x676418e9a927c58291808ff87fdFb5Dd04975aB2",
  "0x9F247D3b7bB4e419E825a2cFf9b3aF66e12306DE",
  "0x9F7d0D5C511C49d74026D4E9F9a6cBe8876E0947"
];

let verified = false;

const alreadyDeployed = new Set<string>(['0', '1', '2', '3']);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/aave_markets.csv', 'utf8').split(/\r?\n/);
  const splittersByUnderlying = new Map<string, string>();

  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  for (const sAdr of splitters) {
    const u = (await cReader.vaultUnderlying(sAdr)).toLowerCase();
    if (splittersByUnderlying.has(u)) {
      throw Error('duplicate und');
    }
    splittersByUnderlying.set(u, sAdr);
  }

  appendFileSync(`./tmp/deployed/IMPERMAX_STRATS_SPLITTER.txt`, '-------------------\n', 'utf8');

  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const tokenAddress = strat[2];
    const aTokenName = strat[3];

    if (idx === 'idx' || !tokenAddress) {
      console.log('skip', idx);
      continue;
    }

    if (alreadyDeployed.has(idx)) {
      console.log('Strategy already deployed', idx);
      continue;
    }

    const splitterAddress = splittersByUnderlying.get(tokenAddress.toLowerCase()) as string;
    if (!splitterAddress) {
      console.log('no splitter for ', aTokenName)
      continue;
    }

    console.log('strat', idx, aTokenName);

    // ** CONFIG
    const controller = core.controller;
    const underlying = tokenAddress;
    const uName = await TokenUtils.tokenSymbol(underlying);
    const name = 'IMPERMAX_' + uName;
    // *****************************

    const minTvl = 100_000;

    const impermaxes = await DeployerUtils.deployImpermaxLikeStrategies(
        signer,
        controller,
        splitterAddress,
        underlying,
        'StrategyImpermax',
        'scripts/utils/download/data/impermax.csv',
        minTvl,
        100_00
    );

    if (impermaxes.length === 0) {
      console.log('No impermaxes for ', name)
      continue
    }

    appendFileSync(`./tmp/deployed/IMPERMAX_STRATS_SPLITTER.txt`, '---\n', 'utf8');

    for (const imx of impermaxes) {
      const tCtr = StrategyImpermax__factory.connect(imx, signer);
      const vaultAddress = await tCtr.vault();
      const poolAddress = await tCtr.pool();
      const buyBackRatio = await tCtr.buyBackRatio();
      const strategyArgs = [
        controller,
        vaultAddress,
        underlying,
        poolAddress,
        buyBackRatio
      ];
      if (!verified && (await ethers.provider.getNetwork()).name !== "hardhat") {
        await DeployerUtils.verifyWithContractName(imx, 'contracts/strategies/matic/impermax/StrategyImpermax.sol:StrategyImpermax', strategyArgs);
        verified = true;
      }
      const txt = `${name}:     splitter: ${splitterAddress}     strategy: ${imx}     poolnumber: ${idx}\n`;
      appendFileSync(`./tmp/deployed/IMPERMAX_STRATS_SPLITTER.txt`, txt, 'utf8');
    }
  }
}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
