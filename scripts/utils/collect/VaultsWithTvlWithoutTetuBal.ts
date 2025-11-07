import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {utils} from "ethers";
import {IERC20Metadata__factory, ISmartVault__factory} from "../../../typechain";

const tetuBalVaultsForExclude = [
  // TETU_ST_BAL;20WETH-80BAL;6118276;true
  '0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33',
  // TETU_ETH-BAL_tetuBAL_BPT_V3;tetuBAL-BALWETH;7199;false
  '0xBD06685a0e7eBd7c92fc84274b297791F3997ed3',
  // Tetu Vault tetuBAL;tetuBAL;1183794;true
  '0x915E49F7CD8B2b5763759c23D9463A74d5b5C1D5',
  // Tetu Vault tetuBAL-BALWETH;tetuBAL-BALWETH;32685;true
  '0xE4F7ed41e2461f162C9409015874716A1E96776F',
]

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  let txt = '';
  const vaults = await core.bookkeeper.vaults();
  for (const vault of vaults) {
    const active = await tools.reader.vaultActive(vault);
    const vName = await tools.reader.vaultName(vault);
    const underlying = await ISmartVault__factory.connect(vault, signer).underlying()
    const uSymbol = await IERC20Metadata__factory.connect(underlying, signer).symbol()
    const tvl = +utils.formatUnits(await tools.reader.vaultTvlUsdc(vault));
    if (tvl < 2000) {
      continue
    }
    if (tetuBalVaultsForExclude.includes(vault)) {
      continue
    }
    txt += `${vault};${vName};${uSymbol};${tvl.toFixed(0)};${active}\n`;
    console.log(txt);
  }
  writeFileSync(`./tmp/vaults-tvl-no-tetubal.txt`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
