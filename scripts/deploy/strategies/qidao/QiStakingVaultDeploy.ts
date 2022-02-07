import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  ContractReader,
  SmartVault,
  StrategyQiStaking,
  TetuProxyControlled__factory
} from "../../../../typechain";
import {writeFileSync} from "fs";
import {RunHelper} from "../../../utils/tools/RunHelper";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  // ********* config **************
  const vaultName = 'TETU_ST_QI'
  const vaultSymbol = 'tetuQi';
  const underlying = MaticAddresses.QI_TOKEN;
  const strategyName = 'StrategyQiStaking';
  const vaultRewardToken = core.psVault
  const rewardDuration = 60 * 60 * 24 * 28;
  const depositFee = 0;
  // ***********************************

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(
    signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  if (vaultNames.has(vaultName)) {
    console.log('Strategy already exist', vaultName);
  }

  const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault") as SmartVault;
  console.log('vaultLogic ' + vaultLogic.address);
  const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
  const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

  await RunHelper.runAndWait(() => vault.initializeSmartVault(
    vaultName,
    vaultSymbol,
    core.controller,
    underlying,
    rewardDuration,
    false,
    vaultRewardToken,
    depositFee
  ), true, true);

  const strategy = await DeployerUtils.deployStrategyProxy(
    signer,
    strategyName,
  ) as StrategyQiStaking;
  const strategyLogic = await TetuProxyControlled__factory.connect(strategy.address, signer).implementation()
  await RunHelper.runAndWait(() => strategy.initialize(core.controller, vault.address));


  const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
  writeFileSync(`./tmp/deployed/${vaultName}.txt`, txt, 'utf8');

  await DeployerUtils.wait(5);

  await DeployerUtils.verify(vaultLogic.address);
  await DeployerUtils.verifyWithArgs(vault.address, [vaultLogic.address]);
  await DeployerUtils.verifyProxy(vault.address);

  await DeployerUtils.verify(strategyLogic);
  await DeployerUtils.verifyWithArgs(strategy.address, [strategyLogic]);
  await DeployerUtils.verifyProxy(strategy.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


