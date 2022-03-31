import {ethers, network} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  BalVaultPipe,
  Announcer, Controller,
  TetuProxyControlled,
  ERC20

} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
// import {TokenUtils} from "../../../../test/TokenUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

const pipesToUpgrade = [
  "0x4bfe2eAc4c8e07fBfCD0D5A003A78900F8e0B589", // AMB WETH
  "0x62E3A5d0321616B73CCc890a5D894384020B768D", // AMB MATIC
  "0xf5c30eC17BcF3C34FB515EC68009e5da28b5D06F", // AMB AAVE
  "0xA69967d315d7add8222aEe81c1F178dAc0017089", // AMB WBTC
  // TODO add MB BAL pipes of cx
]

async function main() {
  const signer = (await ethers.getSigners())[0];
  let gov;
  console.log('network.name', network.name);
  if (network.name === 'hardhat') {
    console.log('impersonate GOV');
    gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);
  } else {
    gov = signer;
  }

  const core = await DeployerUtils.getCoreAddresses();

  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  const BAL = await DeployerUtils.connectInterface(signer, 'ERC20', MaticAddresses.BAL_TOKEN) as ERC20;

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const newPipes: string[] = [];
  const newPipe = await DeployerUtils.deployContract(gov, 'BalVaultPipe') as BalVaultPipe;
  const txt = `impl: ${newPipe.address}\n`;
  appendFileSync(`./tmp/update/BAL-Pipe-Impl.txt`, txt, 'utf8');

  for (const pipe of pipesToUpgrade) {
    newPipes.push(newPipe.address);
  }

  console.log('announceStrategyUpgrades');
  await announcer.announceTetuProxyUpgradeBatch(pipesToUpgrade, newPipes);

  if (network.name !== 'hardhat') return;

  const timeLockSec = (await announcer.timeLock()).toNumber();
  console.log('timeLockSec', timeLockSec);
  await network.provider.send("evm_increaseTime", [timeLockSec+1])
  await network.provider.send("evm_mine")

  console.log('upgrade implementations');
  console.log('pipesToUpgrade, newPipes', pipesToUpgrade, newPipes);
  await controller.upgradeTetuProxyBatch(pipesToUpgrade, newPipes)

  console.log('checking implementations');
  for (let i = 0; i < pipesToUpgrade.length; i++) {
    const pipe = pipesToUpgrade[i];
    console.log('pipe', pipe);
    const proxy = await DeployerUtils.connectInterface(gov, 'TetuProxyControlled', pipe) as TetuProxyControlled;
    const impl = await proxy.implementation()
    console.log('impl newPipes[i]', impl, newPipes[i]);
    if (impl === newPipes[i])
      console.log('OK');
    else
      console.error('!!! NOT UPGRADED');
  }

  // TODO run claim script

  console.log('+Complete');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
