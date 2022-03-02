import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, StrategyTarot__factory} from "../../../../typechain";
import {appendFileSync, readFileSync} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";
import {FtmAddresses} from "../../../addresses/FtmAddresses";

const splitters = ["0x060F0D0136d8811B462281E0f49A421839847BA1",
  "0xbfe9Ef4a44BFc7724FF461D3bD178B882914a591",
  "0x7055e850ae61FA3564352d7fb93Aa27cB3b94b81",
  "0x51404fAF4a0eb613aB606Cf9B412300b4c21a4D9",
  "0xAb9FB94024ECa792a2a22F9464158245BB5895b4",
  "0xd289758E678e58CB93CDB1f871CE227BA1178E6f",
  "0x3a8bEA1b671359C110705AB29D0aA034B5C06173",
  "0x171fbbF17Bb30b50F6E9D575167B1C2Eb9668226",
  "0x4c488C6b7dEc852F45542e89C074C092bA5b759c",
  "0xee1354E1866CD3753B2b608f32417B55A78E0DEC",
  "0x8771559747D6c33a718e3155880Ee4FE5061A7e4",
  "0x9Bc1e68923db49F04c7814f2B4EfC216a6765a00"];

let verified = false;

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync('scripts/utils/download/data/scream_markets.csv', 'utf8').split(/\r?\n/);
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

  appendFileSync(`./tmp/deployed/TAROT_STRATS_SPLITTER.txt`, '-------------------\n', 'utf8');

  for (const info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const scTokenName = strat[1];
    const scTokenAddress = strat[2];
    const tokenAddress = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];
    const tvl = strat[7];

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
      console.log('no splitter for ', scTokenName)
      continue;
    }

    console.log('strat', idx, scTokenName);

    // ** CONFIG
    const controller = core.controller;
    const underlying = tokenAddress;
    const uName = await TokenUtils.tokenSymbol(underlying);
    const name = 'TAROT_' + uName;
    // *****************************

    let minTvl = 100_000;
    if (underlying.toLowerCase() === FtmAddresses.WFTM_TOKEN) {
      minTvl = 1_000_000;
    }

    const tarots = await DeployerUtils.deployImpermaxLikeStrategies(
      signer,
      controller,
      splitterAddress,
      underlying,
      'StrategyTarot',
      'scripts/utils/download/data/tarot.csv',
      minTvl
    );

    // const tarots = ['0xc2772Af3949133163C222c172486aE1FbC3e2bD2'];

    if (tarots.length === 0) {
      console.log('NO TAROTS for ', name)
      continue
    }

    appendFileSync(`./tmp/deployed/TAROT_STRATS_SPLITTER.txt`, '---\n', 'utf8');

    for (const tarot of tarots) {
      const tCtr = StrategyTarot__factory.connect(tarot, signer);
      const vaultAddress = await tCtr.vault();
      const poolAdr = await tCtr.pool();
      const buyBackRatio = await tCtr.buyBackRatio();
      const strategyArgs = [
        controller,
        vaultAddress,
        underlying,
        poolAdr,
        buyBackRatio
      ];
      if (!verified) {
        await DeployerUtils.verifyWithContractName(tarot, 'contracts/strategies/fantom/tarot/StrategyTarot.sol:StrategyTarot', strategyArgs);
        verified = true;
      }
      const txt = `${name}:     splitter: ${splitterAddress}     strategy: ${tarot}\n`;
      appendFileSync(`./tmp/deployed/TAROT_STRATS_SPLITTER.txt`, txt, 'utf8');
    }

  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
