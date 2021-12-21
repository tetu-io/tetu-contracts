import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {SmartVault__factory, TetuSwapFactory} from "../../../typechain";
import {Misc} from "../tools/Misc";
import {RunHelper} from "../tools/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddressesWrapper(signer);
  const coreAdrs = await DeployerUtils.getCoreAddresses();

  const factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', coreAdrs.swapFactory) as TetuSwapFactory;

  const vaults = await core.bookkeeper.vaults();
  const singleVaults: string[] = [];
  for (const vault of vaults) {
    const strategy = await SmartVault__factory.connect(vault, signer).strategy();
    const assets = await tools.reader.strategyAssets(strategy)
    if (assets.length === 1) {
      singleVaults.push(vault);
    }
  }
  console.log('found', singleVaults.length);
  for (const vault0 of singleVaults) {
    const token0 = await tools.reader.vaultUnderlying(vault0);
    const vault0Name = await tools.reader.vaultName(vault0);
    for (const vault1 of singleVaults) {
      if (vault0 === vault1) {
        continue;
      }
      const vault1Name = await tools.reader.vaultName(vault1);
      const token1 = await tools.reader.vaultUnderlying(vault1);
      const pair = await factory.getPair(token0, token1);
      if (pair !== Misc.ZERO_ADDRESS) {
        continue;
      }
      await RunHelper.runAndWait(() => factory.createPair(vault0, vault1));
      console.log('CREATED', vault0Name, vault1Name);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
