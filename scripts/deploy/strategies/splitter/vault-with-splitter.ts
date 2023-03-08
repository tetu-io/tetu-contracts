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
import {Misc} from "../../../utils/tools/Misc";

const VAULT_LOGIC = '0xc8Be20e84E608c9c17422a4928D77Cb7c677d260';
const SPLITTER_LOGIC = '0xf5c32B020C334F523BEAeC5cAF9421B8bDE8227e';

const underlyings = [
  '0x831261f44931b7da8ba0dcc547223c60bb75b47f', // BALANCER_wUSDR_USDC
]

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });

  for (const underlying of underlyings) {
    const undSymbol = await IERC20Extended__factory.connect(underlying, signer).symbol();
    console.log('Deploy for ', undSymbol);

    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", VAULT_LOGIC);
    await RunHelper.runAndWait(() => ISmartVault__factory.connect(vaultProxy.address, signer).initializeSmartVault(
      "Tetu Vault " + undSymbol,
      "x" + undSymbol,
      core.controller,
      underlying,
      60 * 60 * 24 * 7,
      false,
      Misc.ZERO_ADDRESS,
      0
    ));

    const proxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", SPLITTER_LOGIC);
    await RunHelper.runAndWait(() => StrategySplitter__factory.connect(proxy.address, signer).initialize(
      core.controller,
      underlying,
      vaultProxy.address,
    ));


    const txt = `${undSymbol}:     vault: ${vaultProxy.address}     splitter: ${proxy.address}\n`;
    appendFileSync(`./tmp/deployed/eth_balancer_vaults_with_splitters.txt`, txt, 'utf8');
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
