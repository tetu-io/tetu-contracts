import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {utils} from "ethers";
import {
  IStrategy__factory,
  SmartVault__factory,
  StrategySplitter__factory
} from "../../../typechain";

const splitters = [
  '0x9F7d0D5C511C49d74026D4E9F9a6cBe8876E0947',
  '0x26030c3e3790fF4e1236585f2650AE7da56a752C',
  '0x676418e9a927c58291808ff87fdFb5Dd04975aB2',
  '0xbB71CC21786b8d81A2e6cd821Af06C471b167207',
  '0x4C095d11Fa462Da4c7Ccb4D8c2eC288b07291993',
  '0x9F247D3b7bB4e419E825a2cFf9b3aF66e12306DE',
]

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  let txt = '';
  // const vaults = await core.bookkeeper.vaults();
  for (const strategyAdr of splitters) {
    // const v = SmartVault__factory.connect(vault, signer);
    // const active = await v.active();
    // if (!active) {
    //   continue;
    // }
    // const strategyAdr = await v.strategy();
    const strategy = StrategySplitter__factory.connect(strategyAdr, signer);
    const platform = await strategy.platform();
    if (platform !== 24) {
      continue;
    }

    const vault = await strategy.vault();
    const v = SmartVault__factory.connect(vault, signer);
    const vName = await tools.reader.vaultName(vault);
    const dec = await v.decimals();
    const tvl = +utils.formatUnits(await tools.reader.vaultTvlUsdc(vault));
    const subStrats = await strategy.allStrategies();

    // await strategy.setStrategyRatios(subStrats, [100]); // todo remove

    let subStratInfo = '';
    for (const subStrat of subStrats) {
      const s = IStrategy__factory.connect(subStrat, signer);
      const p = await s.platform();
      const ssName = await s.STRATEGY_NAME();
      const ratio = await strategy.strategiesRatios(subStrat);
      const ssTvl = utils.formatUnits(await s.investedUnderlyingBalance(), dec);
      subStratInfo += `${ratio},${ssName},${p},${ssTvl};`
    }


    txt += `${vName};${vault};${tvl.toFixed(0)};${subStratInfo}\n`;
    console.log(txt);
  }
  writeFileSync(`./tmp/splitters.txt`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
