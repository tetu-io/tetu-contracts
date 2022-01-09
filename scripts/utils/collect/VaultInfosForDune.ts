// noinspection SqlNoDataSourceInspection,SqlResolve

import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";
import {writeFileSync} from "fs";
import {SmartVault} from "../../../typechain";
import {Misc} from "../tools/Misc";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);

  let txt = '' +
    'WITH new_values \n' +
    '(vault,\n' +
    'vault_name,\n' +
    'underlying,\n' +
    'decimals,\n' +
    'uniswap_pair,\n' +
    'date_created,\n' +
    'platform) as (\n' +
    'select\n';

  const vaults = await core.bookkeeper.vaults();
  for (const vault of vaults) {
    const i = vaults.indexOf(vault);
    if (i !== 0) {
      txt += 'union\n' +
        'select\n'
    }
    let info = '';
    const underlying = await tools.reader.vaultUnderlying(vault);
    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const strategy = await vCtr.strategy();
    info += `'${vault}',`;
    info += `'${formatName(await tools.reader.vaultName(vault))}',`;
    info += `'${underlying}',`;
    info += `${(await tools.reader.vaultDecimals(vault)).toNumber()},`;
    info += `'${(await tools.calculator.getLargestPool(underlying, []))[2]}',`;
    info += `${await tools.reader.vaultCreated(vault)},`;
    info += `'${Misc.platformName(await tools.reader.strategyPlatform(strategy))}'\n`;
    txt += info;
    console.log(info);
  }
  txt += '),\n' +
    'upsert as\n' +
    '( \n' +
    '    update dune_user_generated.tetu_vault_information tvi\n' +
    '        set vault = nv.vault::bytea,\n' +
    '            vault_name = nv.vault_name,\n' +
    '        underlying = nv.underlying::bytea,\n' +
    '        decimals = nv.decimals,\n' +
    '        uniswap_pair = nv.uniswap_pair::bytea,\n' +
    '        date_created = to_timestamp(nv.date_created)\n' +
    '    FROM new_values nv\n' +
    '    WHERE tvi.vault = nv.vault::bytea\n' +
    '    RETURNING tvi.*\n' +
    ')\n' +
    'INSERT INTO dune_user_generated.tetu_vault_information \n' +
    '(vault, vault_name, underlying, decimals, uniswap_pair, date_created)\n' +
    'SELECT vault::bytea, vault_name, underlying::bytea, decimals, uniswap_pair::bytea, to_timestamp(date_created)\n' +
    'FROM new_values\n' +
    'WHERE NOT EXISTS (SELECT 1 \n' +
    '                  FROM upsert up \n' +
    '                  WHERE up.vault = new_values.vault::bytea)'
  writeFileSync(`./tmp/dune_vaults.sql`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

function formatName(name: string) {
  if (name.startsWith('TETU_IRON_LOAN_')) {
    name = name.replace('TETU_IRON_LOAN_', '');
  }
  if (name.startsWith('TETU_AAVE_')) {
    name = name.replace('TETU_AAVE_', '');
  }
  if (name.startsWith('TETU_')) {
    name = name.replace('TETU_', '')
  }
  return name;
}
