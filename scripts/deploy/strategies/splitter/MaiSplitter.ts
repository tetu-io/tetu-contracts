import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {SmartVault__factory, TetuProxyControlled__factory} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {RunHelper} from "../../../utils/tools/RunHelper";


const vaults = [
  "0xe2EbFD67ed292BaCE45BF93Bb3D828bBaA5A59dE" // TETU_MAI Vault
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
    appendFileSync(`./tmp/deployed/MAI_SPLITTER.txt`, txt, 'utf8');

    const address = 'error verify NomicLabsHardhatPluginError: General exception occured when attempting to insert record \n';
    const splitterLogic = await TetuProxyControlled__factory.connect(address, signer).implementation();

    await DeployerUtils.wait(5);
    await DeployerUtils.verify(splitterLogic);
    await DeployerUtils.verifyWithArgs(address, [splitterLogic]);
    await DeployerUtils.verifyProxy(address);
}}


main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
