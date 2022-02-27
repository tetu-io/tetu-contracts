import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, SmartVault__factory, StrategyTetuSelfFarm} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {Misc} from "../../../utils/tools/Misc";
import {RunHelper} from "../../../utils/tools/RunHelper";

const alreadyDeployed = new Set<string>([]);

const TARGET_VAULTS = [
  // '0x6781e4a6E6082186633130f08246a7af3A7B8b40'.toLowerCase(), // TETU_WETH
  '0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7'.toLowerCase(), // TETU_USDC
  '0xd051605E07C2B526ED9406a555601aA4DB8490D9'.toLowerCase(), // TETU_WBTC
  '0xE680e0317402ad3CB37D5ed9fc642702658Ef57F'.toLowerCase(), // TETU_USDT
  '0xBd2E7f163D7605fa140D873Fea3e28a031370363'.toLowerCase(), // TETU_WMATIC
  '0xb4607D4B8EcFafd063b3A3563C02801c4C7366B2'.toLowerCase(), // TETU_DAI
]

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  for (const targetVault of TARGET_VAULTS) {
    const targetVaultCtr = SmartVault__factory.connect(targetVault, signer);
    const underlying = await targetVaultCtr.underlying();
    const vaultNameWithoutPrefix = await targetVaultCtr.symbol();


    const data = await DeployerUtils.deployVaultAndStrategyProxy(
      vaultNameWithoutPrefix,
      underlying,
      async (vaultAddress) => {
        const strat = await DeployerUtils.deployStrategyProxy(
          signer,
          'StrategyTetuSelfFarm',
        ) as StrategyTetuSelfFarm;
        await DeployerUtils.wait(1);
        await RunHelper.runAndWait(() => strat.initialize(
          core.controller,
          vaultAddress,
          targetVault,
          {gasLimit: 10_000_000}));
        return strat;
      },
      core.controller,
      Misc.ZERO_ADDRESS,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    );

    const txt = `${vaultNameWithoutPrefix} vault: ${data[1].address} strategy: ${data[2].address}\n`;
    appendFileSync(`./tmp/deployed/SELF_FARM.txt`, txt, 'utf8');

    // await DeployerUtils.wait(5);
    //
    // await DeployerUtils.verify(data[0].address);
    // await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    // await DeployerUtils.verifyProxy(data[1].address);
    //
    // const strategyLogic = await TetuProxyControlled__factory.connect(data[2].address, signer).implementation()
    // await DeployerUtils.verify(strategyLogic);
    // await DeployerUtils.verifyWithArgs(data[2].address, [strategyLogic]);
    // await DeployerUtils.verifyProxy(data[2].address);

    console.log('*******************************************')
    console.log('*******************************************')
    console.log('*******************************************')
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
