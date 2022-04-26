import {ethers, network} from "hardhat";
import {DeployerUtils} from '../../DeployerUtils';
import {
  SmartVault__factory,
  Announcer, Controller,
  ERC20

} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {TokenUtils} from "../../../../test/TokenUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {utils} from "ethers";
import {infos} from "./MultiMBInfos";
import {MultiPipeDeployer} from "./MultiPipeDeployer";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const vaultAddresses = [
  '0x1227C91E9816DfEC6f31B7ED5a9F03372762E7Df', // cxDOGE
  '0x48DC012f1E5e6F83e368C8dA7aD7b1B1C8dfEc4a', // cxADA
  '0xe0816eCaF7F7DA3d4DE93430eD4E86AeBf1918aF'  // cxETH
]

async function main() {

  const signer = (await ethers.getSigners())[0];
  let gov: SignerWithAddress;
  if (network.name === 'hardhat') {
    console.log('impersonate GOV');
    gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);
  } else {
    gov = signer;
  }
  const core = await DeployerUtils.getCoreAddresses();
  const coreWrapper = await DeployerUtils.getCoreAddressesWrapper(signer);

  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  const strategyAddresses: string[] = [];
  const deployed = [];

  // --- Deploy new strategies
  const strategyContractName = 'StrategyMaiBal';

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });
  const tmpFileName = `./tmp/update/multiMB_update.txt`;

  for (const vaultAddress of vaultAddresses) {
    console.log('--------- Deploy Strategy ----------')
    const vault = SmartVault__factory.connect(vaultAddress, signer);
    const vaultName = await vault.name();
    console.log('vaultName', vaultName);
    const underlyingAddress = await vault.underlying();
    const info = infos.filter(i => i.underlying.toLowerCase() === underlyingAddress.toLowerCase())[0]
    if (!info) throw new Error('Unknown underlying! Check vaults and infos')

    console.log('strat underlyingName', info.underlyingName);
    const pipes: string[] = [];
    let strategyArgs;
    // tslint:disable-next-line:no-any
    const data: any[] = [];

    strategyArgs = [
      core.controller,
      vaultAddress,
      info.underlying,
      pipes
    ];

    const vaultNameWithoutPrefix = `MULTI_${info.underlyingName}`;

    const deployer = await MultiPipeDeployer.MBStrategyDeployer(strategyContractName, coreWrapper, signer, underlyingAddress, info, pipes);
    const strategy = await deployer(vaultAddress);
    strategyAddresses.push(strategy.address);
    data.push('', vaultAddress, strategy, []);
    deployed.push(data);

    const txt = `${vaultNameWithoutPrefix}:     vault: ${data[1]}     strategy: ${data[2].address}\n`;
    appendFileSync(tmpFileName, txt, 'utf8');

    await DeployerUtils.wait(5);
    for (const pipeAdr of pipes) {
      console.log('verifyImpl pipeAdr', pipeAdr);
      await DeployerUtils.verifyImpl(signer, pipeAdr);
    }

    console.log('verifyImplWithContractName',data[2].address);
    await DeployerUtils.verifyImplWithContractName(
        signer,
        data[2].address,
        'contracts/strategies/matic/multi/StrategyMaiBal.sol:StrategyMaiBal',
        []
    );

  }
  await DeployerUtils.wait(5);

  const arrTxt = 'vaults: '+JSON.stringify(vaultAddresses) + '\n'+
      'strategies: '+JSON.stringify(strategyAddresses) + '\n-----------------\n';
  appendFileSync(tmpFileName, arrTxt, 'utf8');

  if (network.name !== 'hardhat') return;

  // --- Test Upgrade

  for (let i = 0; i < vaultAddresses.length; i++) {
    console.log('--------- Test Upgrade ----------')
    const vaultAddress = vaultAddresses[i];
    const strategyAddress = strategyAddresses[i];
    console.log('strategyAddress', strategyAddress);
    const vault = SmartVault__factory.connect(vaultAddress, signer);
    const vaultGov = SmartVault__factory.connect(vaultAddress, gov);
    const vaultName = await vault.name()
    console.log('vaultName', vaultName);
    const underlyingAddress = await vault.underlying();
    console.log('underlying', underlyingAddress);
    const underlying = await DeployerUtils.connectInterface(signer, 'ERC20', underlyingAddress) as ERC20;
    const amount = utils.parseUnits('1');
    console.log('getToken');
    await TokenUtils.getToken(underlyingAddress, signer.address, amount);

    console.log('announceStrategyUpgrades');
    await announcer.announceStrategyUpgrades([vaultAddress], [strategyAddress]);
    const timeLockSec = (await announcer.timeLock()).toNumber();
    console.log('timeLockSec', timeLockSec);
    await network.provider.send("evm_increaseTime", [timeLockSec + 1])
    await network.provider.send("evm_mine")
    console.log('setVaultStrategyBatch');
    const balanceBefore = await vault.underlyingBalanceWithInvestment();
    await controller.setVaultStrategyBatch([vaultAddress], [strategyAddress]);

    const balance = await underlying.balanceOf(signer.address);
    console.log('balance', balance);
    console.log('approve');
    await underlying.approve(vault.address, amount);
    console.log('depositAndInvest');
    await vault.depositAndInvest(amount);
    console.log('doHardWork');
    await vaultGov.doHardWork();
    const balanceAfter = await vault.underlyingBalanceWithInvestment();
    console.log('balanceAfter', balanceAfter);
    const balanceChange = (balanceAfter.mul(100_000).div(balanceBefore).toNumber()/1000 - 100).toFixed(3);
    console.log('balanceChange', balanceChange);

  }
  console.log('+Complete');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
