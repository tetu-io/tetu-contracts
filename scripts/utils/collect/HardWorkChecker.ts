import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, SmartVault} from "../../../typechain";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const cReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;
  const bookkeeper = await DeployerUtils.connectProxy(core.bookkeeper, signer, "Bookkeeper") as Bookkeeper;

  const vaults = await bookkeeper.vaults();

  for (const vault of vaults) {
    console.log(await cReader.vaultName(vault));
    const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const strategy = await vaultCtr.strategy();
    const data = await bookkeeper.lastHardWork(strategy);
    const daysSinceLast = (((Date.now() / 1000) - data.time.toNumber()) / 60 / 60 / 24).toFixed(2);
    console.log(data.time.toNumber(), new Date(data.time.toNumber() * 1000), daysSinceLast);

  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
