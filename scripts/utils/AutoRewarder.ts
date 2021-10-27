import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {AutoRewarder, Bookkeeper, ContractReader} from "../../typechain";
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

const BATCH = 30;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const reader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader) as ContractReader;
  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const rewarder = await DeployerUtils.connectInterface(signer, 'AutoRewarder', core.autoRewarder) as AutoRewarder;

  const allVaults = await bookkeeper.vaults();

  const vaults: string[] = [];

  for (const vault of allVaults) {
    const isActive = await reader.vaultActive(vault);
    if (!isActive) {
      continue;
    }
    const platform = (await reader.vaultPlatform(vault)).toString();
    if (EXCLUDED_PLATFORM.has(platform)) {
      continue;
    }
    vaults.push(vault);
  }

  for (let i = 0; i < vaults.length / BATCH + 1; i++) {
    await rewarder.collectAndStoreInfo(vaults.slice((i * BATCH), (i * BATCH) + BATCH));
  }

  if ((await ethers.provider.getNetwork()).name === 'hardhat') {
    const signerI = await DeployerUtils.impersonate(signer.address);
    await UniswapUtils.buyToken(signerI, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000')); // 500m wmatic
    await UniswapUtils.buyToken(signerI, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(signerI, MaticAddresses.TETU_SWAP_ROUTER, MaticAddresses.TETU_TOKEN, utils.parseUnits('2000000'));
    await TokenUtils.transfer(MaticAddresses.TETU_TOKEN, signerI, rewarder.address, (await TokenUtils.balanceOf(MaticAddresses.TETU_TOKEN, signer.address)).toString());
  }

  for (let i = 0; i < vaults.length / BATCH + 1; i++) {
    await rewarder.distribute(BATCH);
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
