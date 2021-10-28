import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {AutoRewarder, Bookkeeper, ContractReader, SmartVault} from "../../typechain";
import {UniswapUtils} from "../../test/UniswapUtils";
import {MaticAddresses} from "../../test/MaticAddresses";
import {utils} from "ethers";
import {TokenUtils} from "../../test/TokenUtils";

const EXCLUDED_PLATFORM = new Set<string>([
  '0',
  '1',
  '4',
  '6',
  '7',
  '10',
  '12',
]);

const BATCH = 1;
const FORK = true;

async function main() {
  let signer;
  if (FORK) {
    signer = await DeployerUtils.impersonate('0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94');
  } else {
    signer = (await ethers.getSigners())[0];
  }

  console.log('signer', signer.address);
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const reader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;
  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const rewarder = await DeployerUtils.connectInterface(signer, 'AutoRewarder', core.autoRewarder) as AutoRewarder;

  const allVaults = await bookkeeper.vaults();
  // const vaultsLength = (await bookkeeper.vaultsLength()).toNumber();
  console.log('vaults size', allVaults.length)

  const vaults: string[] = [];

  // for (let i = 0; i < vaultsLength; i++) {
  //   const vault = await bookkeeper._vaults(i);
  for (const vault of vaults) {
    const vName = await reader.vaultName(vault)
    // console.log('vault', i, vault);
    const isActive = await reader.vaultActive(vault);
    if (!isActive) {
      console.log('not active', vName);
      continue;
    }
    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    const platform = (await reader.strategyPlatform(await vCtr.strategy())).toString();
    if (EXCLUDED_PLATFORM.has(platform)) {
      console.log('platform excluded', vName, platform);
      continue;
    }
    vaults.push(vault);
  }

  console.log('sorted vaults', vaults.length);

  for (let i = 0; i < vaults.length / BATCH + 1; i++) {
    const tmp = vaults.slice((i * BATCH), (i * BATCH) + BATCH + 1);
    console.log('collect', i, tmp);
    await rewarder.collectAndStoreInfo(tmp);
  }

  if (FORK) {
    const signerI = await DeployerUtils.impersonate(signer.address);
    await UniswapUtils.buyToken(signerI, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000')); // 500m wmatic
    await UniswapUtils.buyToken(signerI, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signerI, MaticAddresses.TETU_SWAP_ROUTER, MaticAddresses.TETU_TOKEN, utils.parseUnits('2000000'));
    await TokenUtils.transfer(MaticAddresses.TETU_TOKEN, signerI, rewarder.address, (await TokenUtils.balanceOf(MaticAddresses.TETU_TOKEN, signer.address)).toString());
  }

  for (let i = 0; i < vaults.length / BATCH + 1; i++) {
    console.log('distribute', i);
    await rewarder.distribute(BATCH);
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
