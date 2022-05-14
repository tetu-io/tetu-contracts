import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {SmartVault, StrategyBalStaking, TetuProxyControlled__factory} from "../../../../typechain";
import {writeFileSync} from "fs";
import {RunHelper} from "../../../utils/tools/RunHelper";
import {EthAddresses} from "../../../addresses/EthAddresses";
import {Misc} from "../../../utils/tools/Misc";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  // ********* config **************
  const DEPOSITOR = '0xBb84098e47d217f51cB014f692eada1F2280a179';
  const LOCKER = '0x9cC56Fa7734DA21aC88F6a816aF10C5b898596Ce';
  const vaultName = 'TETU_ST_BAL'
  const vaultSymbol = 'tetuBAL';
  const underlying = EthAddresses.BALANCER_BAL_WETH;
  const strategyName = 'StrategyBalStaking';
  const vaultRewardToken = Misc.ZERO_ADDRESS;
  const rewardDuration = 60 * 60 * 24 * 28;
  const depositFee = 0;
  // ***********************************


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
  ) as StrategyBalStaking;
  const strategyLogic = await TetuProxyControlled__factory.connect(strategy.address, signer).implementation()
  await RunHelper.runAndWait(() => strategy.initialize(core.controller, vault.address, DEPOSITOR, LOCKER));


  const txt = `vault: ${vault.address}\nstrategy: ${strategy.address}`;
  writeFileSync(`./tmp/deployed/${vaultName}_ETH.txt`, txt, 'utf8');

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


