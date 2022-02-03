import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {SmartVault__factory, TetuProxyControlled__factory} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {RunHelper} from "../../../utils/tools/RunHelper";


const vaults = [
  // '0x6781e4a6E6082186633130f08246a7af3A7B8b40',
  // '0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7',
  // '0xd051605E07C2B526ED9406a555601aA4DB8490D9',
  // '0xE680e0317402ad3CB37D5ed9fc642702658Ef57F',
  // '0xBd2E7f163D7605fa140D873Fea3e28a031370363',
  '0xb4607D4B8EcFafd063b3A3563C02801c4C7366B2',
];

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  for (const vault of vaults) {
    // ** CONFIG
    const controller = core.controller;
    const underlying = await SmartVault__factory.connect(vault, signer).underlying();
    const vaultName = await SmartVault__factory.connect(vault, signer).name();
    // *****************************

    const splitter = await DeployerUtils.deployStrategySplitter(signer);
    console.log('Splitter init')
    await RunHelper.runAndWait(() => splitter.initialize(
      controller,
      underlying,
      vault,
    ));

    const txt = `${vaultName}:     vault: ${vault}     strategy: ${splitter.address}\n`;
    appendFileSync(`./tmp/deployed/AAVE_SPLITTER.txt`, txt, 'utf8');

    const splitterLogic = await TetuProxyControlled__factory.connect(splitter.address, signer).implementation();

    await DeployerUtils.wait(5);

    await DeployerUtils.verify(splitterLogic);
    await DeployerUtils.verifyWithArgs(splitter.address, [splitterLogic]);
    await DeployerUtils.verifyProxy(splitter.address);
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
