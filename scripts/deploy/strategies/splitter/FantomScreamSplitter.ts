import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {SmartVault__factory, TetuProxyControlled__factory} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {RunHelper} from "../../../utils/tools/RunHelper";


const vaults = [
  // '0xbCfa00159a513d70194648D2588D99108C30c3A1', // TETU_DAI
  // '0x2e3dA9293b9DB4392B83b9668b4740fb55FA1843', // TETU_ETH
  // '0x0a4Ed882FD66B2C4eEC49FB16C56C9fe2b97b9E7', // TETU_WFTM
  '0x736C6408d959Ba0806f11161C87e4A09837e600b', // TETU_BTC
  '0x3570CeC085974c1e7aC3dB2C68Ce65eD4f21ba94', // TETU_fUSDT
  '0x65Be5bd1745A9871a5f042385dB869e78e9A1693', // TETU_USDC
  '0xC4b0916739808E57349C831843a4423bcC509a3C', // TETU_CRV
  '0x572749CD713cBfeacCF06F0c83B68e8c1C10A248', // TETU_FUSD
  '0x2c843E75BaF9AfD52CF5e0f9cb547aA85a131B34', // TETU_LINK
  '0xE2D0e06A612CE44189ebCeD4AF112E19feB0cE71', // TETU_FRAX
  '0xcB1C301C1966f4d26FfeF78EdD4de850392a40B1', // TETU_DOLA
  '0x63290e79760E441E9228C5308E8ff7De50843c20', // TETU_MIM
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
    appendFileSync(`./tmp/deployed/SCREAM_SPLITTER.txt`, txt, 'utf8');

    if (false) {
      const splitterLogic = await TetuProxyControlled__factory.connect(splitter.address, signer).implementation();

      await DeployerUtils.wait(5);

      await DeployerUtils.verify(splitterLogic);
      await DeployerUtils.verifyWithArgs(splitter.address, [splitterLogic]);
      await DeployerUtils.verifyProxy(splitter.address);
    }
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
