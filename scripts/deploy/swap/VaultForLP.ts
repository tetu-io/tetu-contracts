import {ethers} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {
  ContractReader,
  IStrategy,
  SmartVault,
  TetuSwapFactory,
  TetuSwapPair
} from "../../../typechain";
import {RunHelper} from "../../utils/tools/RunHelper";
import {TokenUtils} from "../../../test/TokenUtils";
import {appendFileSync, mkdir} from "fs";

const REWARDS_DURATION = 60 * 60 * 24 * 28; // 28 days

const excludeVaults = new Set<string>([]);

async function main() {
  mkdir('./tmp/deployed', {recursive: true}, (err) => {
    if (err) throw err;
  });
  appendFileSync(`./tmp/update/strategies.txt`, '\n-----------\n', 'utf8');

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  let strategyName = 'StrategyTetuSwap';
  let strategyPath = `contracts/strategies/matic/tetu/${strategyName}.sol:${strategyName}`;
  let rt = core.psVault;
  if ((await ethers.provider.getNetwork()).chainId === 250) {
    strategyName = 'StrategyTetuSwapFantom';
    strategyPath = `contracts/strategies/fantom/tetu/${strategyName}.sol:${strategyName}`;
    rt = core.rewardToken;
  }

  const factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', core.swapFactory) as TetuSwapFactory;

  const length = (await factory.allPairsLength()).toNumber();

  const vaultNames = new Set<string>();

  const cReader = await DeployerUtils.connectContract(signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  // for (let i = 0; i < length; i++) {
  for (let i = 0; i < 1; i++) {
    //   const pair = await factory.allPairs(i);
    const pair = '0xe8F56B590ea274d5D451F786c3270af764F1b793';
    const pairCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', pair) as TetuSwapPair;
    const token0 = await pairCtr.token0();
    const token1 = await pairCtr.token1();

    // if (token0.toLowerCase() !== FtmAddresses.USDC_TOKEN && token1.toLowerCase() !== FtmAddresses.USDC_TOKEN) {
    //   continue;
    // }

    const token0Name = await TokenUtils.tokenSymbol(token0);
    const token1Name = await TokenUtils.tokenSymbol(token1);
    const vaultNameWithoutPrefix = `TETU_SWAP_${token0Name}_${token1Name}`;

    if (excludeVaults.has(vaultNameWithoutPrefix)) {
      console.log('excluded');
      continue;
    }

    if (vaultNames.has(vaultNameWithoutPrefix)) {
      console.log('Strategy already exist', vaultNameWithoutPrefix);
      continue;
    }

    console.log('deploy', vaultNameWithoutPrefix, 'pair', pair);

    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    const strategyArgs = [core.controller, vault.address, pair];

    const strategy = await DeployerUtils.deployContract(signer, strategyName, ...strategyArgs) as IStrategy;

    const strategyUnderlying = await strategy.underlying();

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
      vaultNameWithoutPrefix,
      "x" + vaultNameWithoutPrefix,
      core.controller,
      strategyUnderlying,
      REWARDS_DURATION,
      false,
      rt,
      0
    ));

    const txt = `${vaultNameWithoutPrefix} vault: ${vault.address} strategy: ${strategy.address} pair ${pair}\n`;
    appendFileSync(`./tmp/deployed/TETU_SWAP_VAULTS.txt`, txt, 'utf8');

    await DeployerUtils.wait(5);

    await DeployerUtils.verifyWithContractName(strategy.address, strategyPath, [
      ...strategyArgs
    ]);

    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
    await DeployerUtils.verifyProxy(vaultProxy.address);

  }


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
