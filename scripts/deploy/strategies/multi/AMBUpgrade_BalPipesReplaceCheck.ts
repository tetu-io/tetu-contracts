import {ethers, network} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  BalVaultPipe,
  Announcer, Controller,
  TetuProxyControlled,
  ERC20,
  StrategyAaveMaiBal

} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
// import {TokenUtils} from "../../../../test/TokenUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";

const AMBsToUpgrade = [
  '0x58f5f4010b323c8905C0D6Ef3dCc2299248d0Cb2', // WETH
  '0x3231c694C8D67B90465274dd9b424C6702ca4aD8', // WMATIC
  '0x93899dB30C277e2d6652452984F53F17F022D1a1', // AAVE
  '0xb9162Fecba58F9afBCA6A998Cc088E909F50118C'  // WBTC
]

const pipesToReplace = [
  "0x4bfe2eAc4c8e07fBfCD0D5A003A78900F8e0B589", // AMB WETH
  "0x62E3A5d0321616B73CCc890a5D894384020B768D", // AMB MATIC
  "0xf5c30eC17BcF3C34FB515EC68009e5da28b5D06F", // AMB AAVE
  "0xA69967d315d7add8222aEe81c1F178dAc0017089", // AMB WBTC
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

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const newAMBImpl = await DeployerUtils.deployContract(gov, 'StrategyAaveMaiBal') as StrategyAaveMaiBal;
  const newAMBImpls: string[] = [];
  for (const amb of AMBsToUpgrade) {
    newAMBImpls.push(newAMBImpl.address);
  }
  appendFileSync(`./tmp/update/AMB-Impl.txt`,
      `AMBs: ${JSON.stringify(AMBsToUpgrade)}\n`+
      `impl: ${JSON.stringify(newAMBImpls)}\n`+
      '--------------------\n\n',
      'utf8');

  const newPipes: string[] = [];
  for (const pipe of pipesToReplace) {
    const [newBalPipe,] = await DeployerUtils.deployTetuProxyControlled(gov, 'BalVaultPipe');
    newPipes.push(newBalPipe.address);
  }
  appendFileSync(`./tmp/update/BAL-Pipe-Impl.txt`,
      `pipes: ${JSON.stringify(pipesToReplace)}\n`+
      `new: ${JSON.stringify(newPipes)}\n`+
      '--------------------\n\n',
      'utf8');

  if (network.name !== 'hardhat') return;

  console.log('announceTetuProxyUpgradeBatch AMB Strategy');
  await announcer.announceTetuProxyUpgradeBatch(AMBsToUpgrade, newAMBImpls);

  const timeLockSec = (await announcer.timeLock()).toNumber();
  console.log('timeLockSec', timeLockSec);
  await network.provider.send("evm_increaseTime", [timeLockSec+1])
  await network.provider.send("evm_mine")

  console.log('upgradeTetuProxyBatch AMB Strategies');
  console.log('AMBsToUpgrade, newPipes', AMBsToUpgrade, newPipes);
  await controller.upgradeTetuProxyBatch(AMBsToUpgrade, newAMBImpls)

  console.log('checking AMBs implementations');
  for (let i = 0; i < AMBsToUpgrade.length; i++) {
    const ambToCheck = AMBsToUpgrade[i];
    console.log('ambToCheck', ambToCheck);
    const proxy = await DeployerUtils.connectInterface(gov, 'TetuProxyControlled', ambToCheck) as TetuProxyControlled;
    const impl = await proxy.implementation()
    console.log('impl newPipes[i]', impl, newAMBImpls[i]);
    if (impl === newAMBImpls[i])
      console.log('OK');
    else
      console.error('!!! NOT UPGRADED');
  }

  // Replace pipes
  console.error('-================== Replace pipes ==========');
  for (let i = 0; i < AMBsToUpgrade.length; i++) {
    const strategyAddress = AMBsToUpgrade[i];
    console.log('Replace pipe for', strategyAddress);
    const strategyAaveMaiBal = await DeployerUtils.connectInterface(gov, 'StrategyAaveMaiBal', strategyAddress) as StrategyAaveMaiBal;

    const oldPipe = await strategyAaveMaiBal.pipes(3);
    console.log('oldPipe', oldPipe);
    const pipeToReplace = pipesToReplace[i];
    console.log('pipeToReplace', pipeToReplace);
    const newPipe = newPipes[i];
    console.log('newPipe', newPipe);
    if (oldPipe !== pipeToReplace) {
      console.log('Error: oldPipe !== pipeToReplace - wrong pipe to replace');
      continue;
    }
    await strategyAaveMaiBal.announcePipeReplacement(3, pipeToReplace);

    console.log('timeLockSec', timeLockSec);
    await network.provider.send("evm_increaseTime", [timeLockSec+1])
    await network.provider.send("evm_mine")

    await strategyAaveMaiBal.replacePipe(3, pipeToReplace, 10);

    const replacedPipe = await strategyAaveMaiBal.pipes(3);
    if (replacedPipe !== newPipe) {
      console.log('Error: replacedPipe !== newPipe - pipe not replaced');
      continue;
    }
  }

  // ---- run claim script ---

  console.log('+Complete');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
