import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {
  Bookkeeper,
  ContractReader,
  IStrategy,
  MCv2StrategyFullBuyback,
  SmartVault,
  SNXStrategyFullBuyback,
  TetuProxyControlled,
  WaultStrategyFullBuyback
} from "../../typechain";

async function main() {
  const signer = (await ethers.getSigners())[1];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  const vaults = await bookkeeper.vaults();

  for (let vault of vaults) {
    console.log('verify for ', vault);
    const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const vaultImpl = await (await DeployerUtils.connectInterface(signer, 'TetuProxyControlled', vault) as TetuProxyControlled).implementation();
    const strategy = await vaultCtr.strategy();

    const strategyCtr = await DeployerUtils.connectInterface(signer, 'IStrategy', strategy) as IStrategy;

    const underlying = await vaultCtr.underlying();
    const platform = await strategyCtr.platform();
    const assets = await strategyCtr.assets();

    console.log('------------ LOGIC VERIFY ----------------')
    await DeployerUtils.verify(vaultImpl);
    console.log('----------------------------')
    console.log('------------ PROXY VERIFY ----------------')
    await DeployerUtils.verifyWithArgs(vault, [vaultImpl]);
    console.log('----------------------------')
    await DeployerUtils.verifyProxy(vault);

    console.log('------------ STRATEGY VERIFY ----------------')
    if (platform === 2) {
      const ctr = await DeployerUtils.connectInterface(signer, 'SNXStrategyFullBuyback', strategy) as SNXStrategyFullBuyback;
      if (assets.length === 2) {
        await DeployerUtils.verifyWithArgs(strategy, [
          core.controller,
          vault,
          underlying,
          assets[0],
          assets[1],
          ctr.rewardPool()
        ]);
      }

    } else if (platform === 3) {
      const ctr = await DeployerUtils.connectInterface(signer, 'MCv2StrategyFullBuyback', strategy) as MCv2StrategyFullBuyback;
      if (assets.length === 2) {
        await DeployerUtils.verifyWithArgs(strategy, [
          core.controller,
          vault,
          underlying,
          assets[0],
          assets[1],
          ctr.poolID()
        ]);
      }
    } else if (platform === 4) {
      const ctr = await DeployerUtils.connectInterface(signer, 'WaultStrategyFullBuyback', strategy) as WaultStrategyFullBuyback;
      if (assets.length === 2) {
        await DeployerUtils.verifyWithArgs(strategy, [
          core.controller,
          vault,
          underlying,
          assets[0],
          assets[1],
          ctr.poolID()
        ]);
      }
    }
    console.log('----------------------------')

  }

}


main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
