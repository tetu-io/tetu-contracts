import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {
  IERC20Extended__factory,
  ISmartVault,
  ISmartVault__factory, StrategySplitter__factory,
  TetuProxyControlled__factory
} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {RunHelper} from "../../../utils/tools/RunHelper";

const SPLITTER_LOGIC = '0xf5c32B020C334F523BEAeC5cAF9421B8bDE8227e';

const vaults = [
  "0x5dc1c173587aa562179b03db9d643ff5ff2e4660",
  "0xc6f6e9772361a75988c6cc248a3945a870fb1272",
  "0x7f52d49c8a9779e93613fb14cf07be1500ab9c3a",
]

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });

  for (const vaultAddress of vaults) {
    const vaultName = await IERC20Extended__factory.connect(vaultAddress, signer).symbol();
    const underlying = await ISmartVault__factory.connect(vaultAddress, signer).underlying();
    console.log('Deploy for ', vaultName);

    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", SPLITTER_LOGIC);
    await RunHelper.runAndWait(() => StrategySplitter__factory.connect(proxy.address, signer).initialize(
      core.controller,
      underlying,
      vaultAddress,
    ));


    const txt = `${vaultName}:     vault: ${vaultAddress}     splitter: ${proxy.address}\n`;
    appendFileSync(`./tmp/deployed/eth_balancer_splitters.txt`, txt, 'utf8');
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
